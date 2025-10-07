"use strict";

import {
  initVideo,
  startLocalVideo,
  stopLocalVideo,
  setupRemoteVideoEvents,
} from "./video.js";
import { initChat, setupDataChannels } from "./chat.js";

const SERVER_URL = "http://localhost:8080";
const socket = io(SERVER_URL);
const offerOptions = {
  offerToReceiveVideo: 1,
  offerToReceiveAudio: 1,
};

export let localStream;
const peerConnections = {};

let startTime = null;

// Buttons
const startButton = document.getElementById("startButton");
const callButton = document.getElementById("callButton");
const hangupButton = document.getElementById("hangupButton");
const stopButton = document.getElementById("stopButton");

callButton.disabled = true;
hangupButton.disabled = true;

// Initialize modules
initVideo();
initChat();

// === Signaling Server Handlers ===
socket.on("connect", () => {
  trace(`✅ Connected to signaling server with ID: ${socket.id}`);
});

socket.on("all-users", (users) => {
  trace(`👥 Users already in room: ${users}`);
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
  const pc = createPeerConnection(payload.callerID, true);
  pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
  pc.createAnswer().then((answer) => {
    pc.setLocalDescription(new RTCSessionDescription(answer));
    trace(`Sending answer to ${payload.callerID}`);
    socket.emit("send-answer", {
      signal: answer,
      callerID: payload.callerID,
    });
  });
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
  const configuration = {};
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

  pc.addStream(localStream);

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
  trace("Starting call.");
  const roomID = prompt("Enter room name:");
  if (roomID) {
    socket.emit("join-room", roomID);
  } else {
    trace("Call cancelled, no room name provided.");
    callButton.disabled = false;
    hangupButton.disabled = true;
  }
}

function hangupAction() {
  trace("Ending call.");
  socket.disconnect();
  for (const id in peerConnections) {
    peerConnections[id].close();
  }
  Object.keys(peerConnections).forEach((key) => delete peerConnections[key]);
  clearRemoteVideos();
  hangupButton.disabled = true;
  callButton.disabled = false;
}

function stopAction() {
  stopLocalVideo();
  if (socket.connected) socket.disconnect();
  startButton.disabled = false;
  callButton.disabled = true;
  hangupButton.disabled = true;
  clearRemoteVideos();
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
