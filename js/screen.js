"use strict";

import { trace } from "./client.js";

const socket = io("http://localhost:8080");

export function startScreenShare() {
  navigator.mediaDevices.getDisplayMedia({ video: true })
    .then((stream) => {
      const screenTrack = stream.getVideoTracks()[0];
      socket.emit("screen-share", { track: screenTrack });

      // Handle the track ending
      screenTrack.onended = () => {
        socket.emit("stop-screen-share");
      };
    })
    .catch((error) => {
      trace(`Error starting screen share: ${error}`);
    });
}

export function stopScreenShare() {
  socket.emit("stop-screen-share");
}

// Socket event listeners for screen sharing
socket.on("screen-share", (payload) => {
  const pc = createPeerConnection(payload.callerID);
  pc.addTrack(payload.track);
  trace(`Screen shared from ${payload.callerID}`);
});

socket.on("stop-screen-share", (callerID) => {
  const pc = peerConnections[callerID];
  if (pc) {
    const sender = pc.getSenders().find(s => s.track.kind === "video" && s.track.label === "screen");
    if (sender) {
      pc.removeTrack(sender);
      trace(`Stopped screen share from ${callerID}`);
    }
  }
});