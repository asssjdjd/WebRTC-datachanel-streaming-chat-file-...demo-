'use strict';

import { initVideo, startLocalVideo, stopLocalVideo } from './video.js';
import { initChat, setupDataChannels } from './chat.js';

const offerOptions = {
  offerToReceiveVideo: 1,
  offerToReceiveAudio: 0,
};

export let localStream;
export let localPeerConnection;
export let remotePeerConnection;

let startTime = null;

// Buttons
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const stopButton = document.getElementById('stopButton');

callButton.disabled = true;
hangupButton.disabled = true;

// Initialize modules
initVideo();
initChat();

// === Peer Connection Handlers ===
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

// === Button Actions ===
function startAction() {
  startButton.disabled = true;
  startLocalVideo()
    .then((stream) => {
      localStream = stream;
      callButton.disabled = false;
    })
    .catch((error) => {
      trace(`Error starting video: ${error.toString()}`);
    });
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
  
  // Setup video stream
  const remoteVideo = document.getElementById('remoteVideo');
  remotePeerConnection.addEventListener('addstream', (event) => {
    remoteVideo.srcObject = event.stream;
    trace('Remote peer connection received remote stream.');
  });

  // Setup data channels for chat & file transfer
  setupDataChannels(localPeerConnection, remotePeerConnection);

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
  localPeerConnection = null;
  remotePeerConnection = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}

function stopAction() {
  stopLocalVideo();
  startButton.disabled = false;
  callButton.disabled = true;
  hangupButton.disabled = true;
}

// Event listeners
startButton.addEventListener('click', startAction);
callButton.addEventListener('click', callAction);
hangupButton.addEventListener('click', hangupAction);
stopButton.addEventListener('click', stopAction);

// === Helpers ===
export function getOtherPeer(peerConnection) {
  return peerConnection === localPeerConnection ? remotePeerConnection : localPeerConnection;
}

export function getPeerName(peerConnection) {
  return peerConnection === localPeerConnection ? 'localPeerConnection' : 'remotePeerConnection';
}

export function trace(text) {
  text = text.trim();
  const now = (window.performance.now() / 1000).toFixed(3);
  console.log(now, text);
}