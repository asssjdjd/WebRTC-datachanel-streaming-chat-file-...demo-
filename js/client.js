"use strict";

import {
  initVideo,
  startLocalVideo,
  setupRemoteVideoEvents,
  setLocalPreviewVisible,
  stopLocalVideo,
} from "./video.js";
import { initChat, setupDataChannels } from "./chat.js";
import { initFileTransfer } from "./file.js";
import { startScreenShare, stopScreenShare } from "./video.js";

const SERVER_URL = "http://localhost:8080";
const socket = io(SERVER_URL);
const offerOptions = {
  offerToReceiveVideo: 1,
  offerToReceiveAudio: 1,
};

export let localStream;
const peerConnections = {
  // 'socketID': RTCPeerConnection  
};

// Track/send state
let isMuted = false;
let isVideoHidden = false;

let startTime = null;
let roomID = null;

// Buttons
const startButton = document.getElementById("startButton");
const callButton = document.getElementById("callButton");
const hangupButton = document.getElementById("hangupButton");
const stopButton = document.getElementById("stopButton");

const muteButton = document.getElementById("muteButton");
const hideVideoButton = document.getElementById("hideVideoButton");
const screenShareButton = document.getElementById("screenShareButton");
const recordButton = document.getElementById("recordButton");

const localVideo = document.getElementById("localVideo");

callButton.disabled = true;
hangupButton.disabled = true;
muteButton.disabled = true;
hideVideoButton.disabled = true;
screenShareButton.disabled = true;
recordButton.disabled = true;

// Initialize modules
initVideo();
initChat();
initFileTransfer();

// Helper: apply local mute/video settings to the localStream tracks and to existing peer senders
function applyLocalTrackState() {
  if (!localStream) return;

  // Update the actual MediaStreamTracks on the local stream
  localStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
  localStream.getVideoTracks().forEach((t) => (t.enabled = !isVideoHidden));

  // For each existing peer connection, ensure the sender's track enabled state matches
  Object.values(peerConnections).forEach((pc) => {
    try {
      pc.getSenders().forEach((sender) => {
        if (!sender.track) return;
        if (sender.track.kind === "audio") sender.track.enabled = !isMuted;
        if (sender.track.kind === "video") sender.track.enabled = !isVideoHidden;
      });
    } catch (e) {
      // ignore
    }
  });
}

// Button handlers for mute / hide video
muteButton.addEventListener("click", () => {
  isMuted = !isMuted;
  muteButton.textContent = isMuted ? "Unmute" : "Mute";
  applyLocalTrackState();
});

hideVideoButton.addEventListener("click", () => {
  isVideoHidden = !isVideoHidden;
  hideVideoButton.textContent = isVideoHidden ? "Show Video" : "Hide Video";
  applyLocalTrackState();
});


// Screen sharing button handler
screenShareButton.addEventListener("click", () => {
  if (screenShareButton.textContent === "Share Screen") {
    startScreenShare()
      .then((screenStream) => {
        // replace video tracks on existing peer connections with the screen track
        const screenTrack = screenStream.getVideoTracks()[0];
        Object.entries(peerConnections).forEach(([peerId, pc]) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
          if (sender && sender.replaceTrack) {
            sender.replaceTrack(screenTrack);
          } else {
            // fallback: remove existing video sender and add new, then renegotiate
            if (sender) pc.removeTrack(sender);
            pc.addTrack(screenTrack, screenStream);
            // create an offer for renegotiation so the remote side gets the new track
            pc.createOffer().then((offer) => {
              return pc.setLocalDescription(offer).then(() => {
                socket.emit("send-offer", {
                  userToSignal: peerId,
                  callerID: socket.id,
                  signal: offer,
                });
              });
            }).catch((e) => trace(`Renegotiation offer failed: ${e}`));
          }
        });
        screenShareButton.textContent = "Stop Sharing";
      })
      .catch((e) => trace(`Screen share failed: ${e}`));
  } else {
    // stop screen share and restore camera video tracks
    stopScreenShare();
    // attempt to restore camera track from localStream
    const camTrack = localStream ? localStream.getVideoTracks()[0] : null;
    Object.entries(peerConnections).forEach(([peerId, pc]) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender && camTrack) {
        if (sender.replaceTrack) {
          sender.replaceTrack(camTrack);
        } else {
          if (sender) pc.removeTrack(sender);
          pc.addTrack(camTrack, localStream);
          pc.createOffer().then((offer) => {
            return pc.setLocalDescription(offer).then(() => {
              socket.emit("send-offer", {
                userToSignal: peerId,
                callerID: socket.id,
                signal: offer,
              });
            });
          }).catch((e) => trace(`Renegotiation offer failed: ${e}`));
        }
      }
    });
    // restore preview to camera stream
    setLocalPreviewVisible(true);
    if (localStream) document.getElementById("localVideo").srcObject = localStream;
    screenShareButton.textContent = "Share Screen";
  }
});


// === Signaling Server Handlers ===
socket.on("connect", () => {
  trace(` Connected to signaling server with ID: ${socket.id}`);
});

socket.on("all-users", (users) => {
  trace(`👥 Users already in room: ${users}`);
  if (users.length === 0) {
    trace("room is empty");
    // return;
  }

  if(users.length === 1) {
    trace("only one user in the room");
    trace("room id is " + roomID);
    // return;
  }

  users.forEach((userID) => {
    const pc = createPeerConnection(userID);
    pc.createOffer(offerOptions).then((offer) => {
      pc.setLocalDescription(new RTCSessionDescription(offer));
      trace(`Sending offer to ${userID}`);
      socket.emit("send-offer", {
        userToSignal: userID,
        callerID: socket.id,
        signal: offer,
      });
    });
  });
});

socket.on("user-joined", (userID) => {
  trace(`👋 User joined: ${userID}`);
});

socket.on("offer-received", (payload) => {
  trace(`🔔 Received offer from ${payload.callerID}`);
  // Reuse existing peer connection if it exists (important for renegotiation)
  let pc = peerConnections[payload.callerID];
  if (!pc) {
    pc = createPeerConnection(payload.callerID, true);
  }
  pc.setRemoteDescription(new RTCSessionDescription(payload.signal))
    .then(() => pc.createAnswer())
    .then((answer) => pc.setLocalDescription(new RTCSessionDescription(answer)).then(() => answer))
    .then((answer) => {
      trace(`Sending answer to ${payload.callerID}`);
      socket.emit("send-answer", {
        signal: answer,
        callerID: payload.callerID,
      });
    })
    .catch((e) => trace(`Error handling offer from ${payload.callerID}: ${e}`));
});
socket.on("answer-received", (payload) => {
  trace(`🤝 Received answer from ${payload.id}`);
  const pc = peerConnections[payload.id];
  pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
});
socket.on("candidate-received", (payload) => {
  const pc = peerConnections[payload.callerID];
  if (pc) {
    pc.addIceCandidate(new RTCIceCandidate(payload.signal));
  }
});

socket.on("user-left", (id) => {
  trace(`💨 User left: ${id}`);
  if (peerConnections[id]) {
    peerConnections[id].close();
    delete peerConnections[id];
  }
  const videoToRemove = document.getElementById(`video-${id}`);
  if (videoToRemove) {
    videoToRemove.remove();
  }
});

// === Peer Connection Handlers ===
function createPeerConnection(partnerSocketId, isReceiver = false) {
  // configuration for RTCPeerConnection
  const configuration = {
    'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }, {
    // A TURN server you control. Use your own!
    urls: [ 
        'turn:turn.mydomain.com:3478?transport=udp',
        'turn:turn.mydomain.com:3478?transport=tcp',
        'turns:turn.mydomain.com:5349?transport=tcp'
      ],
      username: 'webrtcuser',
      credential: 'webrtcpass'
    }
  ]
  };
  const pc = new RTCPeerConnection(configuration);

  peerConnections[partnerSocketId] = pc;

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("send-candidate", {
        userToSignal: partnerSocketId,
        callerID: socket.id,
        signal: event.candidate,
      });
    }
  };

  pc.onaddstream = (event) => {
    trace(`Received remote stream from ${partnerSocketId}`);
    const videoGrid = document.getElementById("videoGrid");
    const video = document.createElement("video");

    video.id = `video-${partnerSocketId}`;
    video.srcObject = event.stream;
    video.autoplay = true;
    video.playsInline = true;
    setupRemoteVideoEvents(video);
    videoGrid.appendChild(video);
  };

  if (localStream) {
    pc.addStream(localStream);
  }

  if (isReceiver) {
    setupDataChannels(null, pc);
  } else {
    setupDataChannels(pc, null);
  }

  return pc;
}

// === Button Actions ===
function startAction() {
  startButton.disabled = true;
  muteButton.disabled = false;
  hideVideoButton.disabled = false;
  screenShareButton.disabled = false;
  trace("Requesting local stream.");
  startLocalVideo()
    .then((stream) => {
      localStream = stream;
      // apply any existing mute / video-hidden preferences to the newly acquired stream
      applyLocalTrackState();
      // ensure local preview visibility matches the flag
      setLocalPreviewVisible(!isVideoHidden);

      callButton.disabled = false;
    })
    .catch((error) => {
      trace(`Error starting video: ${error.toString()}`);
    });
}

function callAction() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  trace("Starting call.");
  roomID = prompt("Enter room name:");

  if (roomID) {
    socket.emit("join-room", roomID);
  } else {
    trace("Call cancelled, no room name provided.");
    callButton.disabled = false;
    hangupButton.disabled = true;
  }
}

function hangupAction() {
  trace("Ending call and leaving room.");
  muteButton.disabled = true;
  hideVideoButton.disabled = true;
  screenShareButton.disabled = true;

  // Tell signaling server we're leaving the room so other peers remove us
  if (roomID) {
    socket.emit("leave-room", roomID);
    roomID = null;
  }

  // Close and remove all peer connections
  for (const id in peerConnections) {
    try {
      peerConnections[id].close();
    } catch (e) {
      // ignore
    }
    delete peerConnections[id];
    const videoToRemove = document.getElementById(`video-${id}`);
    if (videoToRemove) videoToRemove.remove();
  }

  // Clear remote video elements and reset UI to initial state
  clearRemoteVideos();
  hangupButton.disabled = true;
  // reset internal flags
  isMuted = false;
  isVideoHidden = false;
  muteButton.textContent = "Mute";
  hideVideoButton.textContent = "Hide Video";
  localVideo.srcObject = null;
  localStream = null;
  startButton.disabled = false;
  chatButton.disabled = true;
  setLocalPreviewVisible(true);
  callButton.disabled = true;
}

function stopAction() {
  trace("Stopping local media preview.");
  stopLocalVideo();
  // clear the localStream reference but keep tracks stopped
  localStream = null;
  callButton.disabled = true;
  hangupButton.disabled = true;
  muteButton.disabled = true;
  hideVideoButton.disabled = true;
  screenShareButton.disabled = true;
}



function clearRemoteVideos() {
  const videoGrid = document.getElementById("videoGrid");
  videoGrid.childNodes.forEach((child) => {
    if (child.id !== "localVideo") {
      videoGrid.removeChild(child);
    }
  });
}

// Event listeners
startButton.addEventListener("click", startAction);
callButton.addEventListener("click", callAction);
hangupButton.addEventListener("click", hangupAction);
stopButton.addEventListener("click", stopAction);

// === Helpers ===

export function trace(text) {
  text = text.trim();
  const now = (window.performance.now() / 1000).toFixed(3);
  console.log(now, text);
}
