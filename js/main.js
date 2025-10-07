'use strict';

const mediaStreamConstraints = {
  video: true,
  audio: false,
};

const offerOptions = {
  offerToReceiveVideo: 1,
  offerToReceiveAudio: 0,
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream;
let remoteStream;
let localPeerConnection;
let remotePeerConnection;

let dataChannel;
let receiveChannel;

let startTime = null;

// File transfer state
let fileReader;
let receiveBuffer = [];
let receivedSize = 0;
let fileMetadata = null;

const CHUNK_SIZE = 16384; // 16KB chunks

// === Chat elements ===
const chatButton = document.getElementById('chatButton');
const chatBox = document.getElementById('chatBox');
const chatArea = document.getElementById('chatArea');
const chatInput = document.getElementById('chatInput');
const sendMsg = document.getElementById('sendMsg');
const sendFile = document.getElementById('sendFile');
const fileInput = document.getElementById('fileInput');

chatButton.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'block' : 'none';
});

sendMsg.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
sendFile.addEventListener('click', sendFileData);

function appendMessage(sender, message) {
  const div = document.createElement('div');
  div.innerHTML = `<b>${sender}:</b> ${message}`;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// === Media setup ===
function gotLocalMediaStream(mediaStream) {
  localVideo.srcObject = mediaStream;
  localStream = mediaStream;
  trace('Received local stream.');
  callButton.disabled = false;
}

function handleLocalMediaStreamError(error) {
  trace(`navigator.getUserMedia error: ${error.toString()}.`);
}

function gotRemoteMediaStream(event) {
  const mediaStream = event.stream;
  remoteStream = mediaStream;
  remoteVideo.srcObject = mediaStream;
  trace('Remote peer connection received remote stream.');
}

// === Video Events ===
function logVideoLoaded(event) {
  const video = event.target;
  trace(`${video.id} videoWidth: ${video.videoWidth}px, videoHeight: ${video.videoHeight}px.`);
}

function logResizedVideo(event) {
  logVideoLoaded(event);
  if (startTime) {
    const elapsedTime = window.performance.now() - startTime;
    trace(`Time to first video frame: ${elapsedTime.toFixed(3)} ms`);
    startTime = null;
  }
}

localVideo.addEventListener('loadedmetadata', logVideoLoaded);
remoteVideo.addEventListener('loadedmetadata', logVideoLoaded);
remoteVideo.addEventListener('resize', logResizedVideo);

// === Peer Connection ===
function handleConnection(event) {
  const peerConnection = event.target;
  const iceCandidate = event.candidate;

  if (iceCandidate) {
    const newIceCandidate = new RTCIceCandidate(iceCandidate);
    const otherPeer = getOtherPeer(peerConnection);
    otherPeer
      .addIceCandidate(newIceCandidate)
      .then(() => handleConnectionSuccess(peerConnection))
      .catch((error) => handleConnectionFailure(peerConnection, error));
    trace(`${getPeerName(peerConnection)} ICE candidate:\n${event.candidate.candidate}.`);
  }
}

function handleConnectionSuccess(peerConnection) {
  trace(`${getPeerName(peerConnection)} addIceCandidate success.`);
}

function handleConnectionFailure(peerConnection, error) {
  trace(`${getPeerName(peerConnection)} failed to add ICE Candidate:\n${error.toString()}.`);
}

function handleConnectionChange(event) {
  const peerConnection = event.target;
  trace(`${getPeerName(peerConnection)} ICE state: ${peerConnection.iceConnectionState}.`);
}

function setSessionDescriptionError(error) {
  trace(`Failed to create session description: ${error.toString()}.`);
}

function setDescriptionSuccess(peerConnection, functionName) {
  const peerName = getPeerName(peerConnection);
  trace(`${peerName} ${functionName} complete.`);
}

function setLocalDescriptionSuccess(peerConnection) {
  setDescriptionSuccess(peerConnection, 'setLocalDescription');
}

function setRemoteDescriptionSuccess(peerConnection) {
  setDescriptionSuccess(peerConnection, 'setRemoteDescription');
}

function createdOffer(description) {
  trace(`Offer from localPeerConnection:\n${description.sdp}`);
  localPeerConnection.setLocalDescription(description)
    .then(() => setLocalDescriptionSuccess(localPeerConnection))
    .catch(setSessionDescriptionError);

  remotePeerConnection.setRemoteDescription(description)
    .then(() => setRemoteDescriptionSuccess(remotePeerConnection))
    .catch(setSessionDescriptionError);

  remotePeerConnection.createAnswer()
    .then(createdAnswer)
    .catch(setSessionDescriptionError);
}

function createdAnswer(description) {
  trace(`Answer from remotePeerConnection:\n${description.sdp}.`);
  remotePeerConnection.setLocalDescription(description)
    .then(() => setLocalDescriptionSuccess(remotePeerConnection))
    .catch(setSessionDescriptionError);
  localPeerConnection.setRemoteDescription(description)
    .then(() => setRemoteDescriptionSuccess(localPeerConnection))
    .catch(setSessionDescriptionError);
}

// === Buttons ===
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const stopButton = document.getElementById('stopButton');

callButton.disabled = true;
hangupButton.disabled = true;

function startAction() {
  startButton.disabled = true;
  navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
    .then(gotLocalMediaStream)
    .catch(handleLocalMediaStreamError);
  trace('Requesting local stream.');
}

function callAction() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  trace('Starting call.');
  startTime = window.performance.now();

  const configuration = {};

  localPeerConnection = new RTCPeerConnection(configuration);
  remotePeerConnection = new RTCPeerConnection(configuration);

  localPeerConnection.addEventListener('icecandidate', handleConnection);
  localPeerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange);

  remotePeerConnection.addEventListener('icecandidate', handleConnection);
  remotePeerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange);
  remotePeerConnection.addEventListener('addstream', gotRemoteMediaStream);

  // === Data Channel ===
  dataChannel = localPeerConnection.createDataChannel('chat');
  dataChannel.binaryType = 'arraybuffer';
  dataChannel.onopen = handleDataChannelStatusChange;
  dataChannel.onclose = handleDataChannelStatusChange;
  dataChannel.onmessage = handleDataMessage;

  remotePeerConnection.ondatachannel = (event) => {
    receiveChannel = event.channel;
    receiveChannel.binaryType = 'arraybuffer';
    receiveChannel.onmessage = handleDataMessage;
    receiveChannel.onopen = handleDataChannelStatusChange;
    receiveChannel.onclose = handleDataChannelStatusChange;
  };

  localPeerConnection.addStream(localStream);
  trace('Added local stream to localPeerConnection.');

  localPeerConnection.createOffer(offerOptions)
    .then(createdOffer)
    .catch(setSessionDescriptionError);
  trace('localPeerConnection createOffer start.');
}

function hangupAction() {
  trace('Ending call.');
  localPeerConnection.close();
  remotePeerConnection.close();
  dataChannel && dataChannel.close();
  receiveChannel && receiveChannel.close();
  localPeerConnection = null;
  remotePeerConnection = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}

function stopAction() {
  trace('Stopping media.');
  localStream.getTracks().forEach((track) => track.stop());
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  startButton.disabled = false;
  callButton.disabled = true;
  hangupButton.disabled = true;
}

startButton.addEventListener('click', startAction);
callButton.addEventListener('click', callAction);
hangupButton.addEventListener('click', hangupAction);
stopButton.addEventListener('click', stopAction);

// === Data Channel Handlers ===
function handleDataMessage(event) {
  console.log('📨 Received data:', typeof event.data, event.data);
  
  if (typeof event.data === 'string') {
    try {
      const data = JSON.parse(event.data);
      console.log('📋 Parsed JSON:', data);
      
      // File metadata
      if (data.type === 'file-meta') {
        fileMetadata = data;
        receiveBuffer = [];
        receivedSize = 0;
        console.log('📁 File metadata received:', fileMetadata);
        appendMessage('Remote', `📁 Receiving file: ${data.name} (${formatBytes(data.size)})`);
      }
      // File end signal
      else if (data.type === 'file-end') {
        console.log('✅ File transfer complete! Chunks:', receiveBuffer.length, 'Total size:', receivedSize);
        
        // Use metadata from file-end message OR saved metadata
        const meta = {
          name: data.name || (fileMetadata ? fileMetadata.name : 'download'),
          size: data.size || receivedSize,
          mimeType: data.mimeType || (fileMetadata ? fileMetadata.type : 'application/octet-stream')
        };
        
        console.log('📄 File info:', meta);
        
        const received = new Blob(receiveBuffer, { type: meta.mimeType });
        const url = URL.createObjectURL(received);
        console.log('🔗 Blob URL created:', url);
        
        const messageDiv = document.createElement('div');
        messageDiv.style.marginBottom = '10px';
        messageDiv.style.padding = '8px';
        messageDiv.style.backgroundColor = '#f0f0f0';
        messageDiv.style.borderRadius = '5px';
        
        const textSpan = document.createElement('span');
        textSpan.innerHTML = `<b>Remote:</b> 📁 ${meta.name} (${formatBytes(meta.size)}) `;
        messageDiv.appendChild(textSpan);
        
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '💾 Download';
        downloadBtn.style.padding = '5px 15px';
        downloadBtn.style.cursor = 'pointer';
        downloadBtn.style.backgroundColor = '#4CAF50';
        downloadBtn.style.color = 'white';
        downloadBtn.style.border = 'none';
        downloadBtn.style.borderRadius = '3px';
        downloadBtn.style.fontWeight = 'bold';
        
        const fileName = meta.name;
        downloadBtn.onclick = function() {
          console.log('🖱️ Download button clicked!');
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          console.log('✅ Download triggered for:', fileName);
        };
        
        messageDiv.appendChild(downloadBtn);
        chatArea.appendChild(messageDiv);
        chatArea.scrollTop = chatArea.scrollHeight;
        
        console.log('✅ Download button added to chat!');
        
        receiveBuffer = [];
        receivedSize = 0;
        fileMetadata = null;
      }
      // Regular message
      else {
        appendMessage('Remote', data.text || event.data);
      }
    } catch (e) {
      // Plain text message
      console.log('💬 Plain text message');
      appendMessage('Remote', event.data);
    }
  } else {
    // Binary data (file chunk)
    console.log('📦 Binary chunk received:', event.data.byteLength, 'bytes');
    receiveBuffer.push(event.data);
    receivedSize += event.data.byteLength;
    
    if (fileMetadata) {
      const progress = ((receivedSize / fileMetadata.size) * 100).toFixed(1);
      trace(`Receiving file: ${progress}% (${formatBytes(receivedSize)}/${formatBytes(fileMetadata.size)})`);
    }
  }
}

function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  
  const channel = dataChannel || receiveChannel;
  if (!channel || channel.readyState !== 'open') {
    appendMessage('System', '❌ Data channel not ready');
    return;
  }
  
  appendMessage('You', msg);
  channel.send(JSON.stringify({ text: msg }));
  chatInput.value = '';
}

function sendFileData() {
  const file = fileInput.files[0];
  if (!file) {
    appendMessage('System', '❌ Please select a file');
    return;
  }
  
  const channel = dataChannel || receiveChannel;
  if (!channel || channel.readyState !== 'open') {
    appendMessage('System', '❌ Data channel not ready');
    return;
  }
  
  appendMessage('You', `📁 Sending file: ${file.name} (${formatBytes(file.size)})`);
  
  // Send file metadata
  channel.send(JSON.stringify({
    type: 'file-meta',
    name: file.name,
    size: file.size,
    type: file.type
  }));
  
  // Send file in chunks
  let offset = 0;
  fileReader = new FileReader();
  
  fileReader.addEventListener('error', error => {
    appendMessage('System', `❌ File read error: ${error}`);
  });
  
  fileReader.addEventListener('abort', event => {
    appendMessage('System', '❌ File read aborted');
  });
  
  fileReader.addEventListener('load', e => {
    channel.send(e.target.result);
    offset += e.target.result.byteLength;
    
    const progress = ((offset / file.size) * 100).toFixed(1);
    trace(`Sending file: ${progress}% (${formatBytes(offset)}/${formatBytes(file.size)})`);
    
    if (offset < file.size) {
      readSlice(offset);
    } else {
      // Send end signal with metadata
      channel.send(JSON.stringify({ 
        type: 'file-end',
        name: file.name,
        size: file.size,
        mimeType: file.type
      }));
      appendMessage('System', '✅ File sent successfully');
      fileInput.value = '';
    }
  });
  
  const readSlice = o => {
    const slice = file.slice(offset, o + CHUNK_SIZE);
    fileReader.readAsArrayBuffer(slice);
  };
  
  readSlice(0);
}

function handleDataChannelStatusChange(event) {
  const channel = dataChannel || receiveChannel;
  const readyState = channel ? channel.readyState : 'undefined';
  trace(`Data channel state is: ${readyState}`);
  
  if (readyState === 'open') {
    appendMessage('System', '✅ Chat connected');
  } else if (readyState === 'closed') {
    appendMessage('System', '❌ Chat disconnected');
  }
}

// === Helpers ===
function getOtherPeer(peerConnection) {
  return peerConnection === localPeerConnection ? remotePeerConnection : localPeerConnection;
}

function getPeerName(peerConnection) {
  return peerConnection === localPeerConnection ? 'localPeerConnection' : 'remotePeerConnection';
}

function trace(text) {
  text = text.trim();
  const now = (window.performance.now() / 1000).toFixed(3);
  console.log(now, text);
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}