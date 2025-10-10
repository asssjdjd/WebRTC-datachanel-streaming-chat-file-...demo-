"use strict";

import { trace } from "./client.js";

const mediaStreamConstraints = {
  video: true,
  audio: true,
};

const localVideo = document.getElementById("localVideo");
// const remoteVideo = document.getElementById("remoteVideo");

let startTime = null;

// === Video Events ===
function logVideoLoaded(event) {
  const video = event.target;
  trace(
    `${video.id} videoWidth: ${video.videoWidth}px, videoHeight: ${video.videoHeight}px.`
  );
}

function logResizedVideo(event) {
  logVideoLoaded(event);
  if (startTime) {
    const elapsedTime = window.performance.now() - startTime;
    trace(`Time to first video frame: ${elapsedTime.toFixed(3)} ms`);
    startTime = null;
  }
}

export function initVideo() {
  localVideo.addEventListener("loadedmetadata", logVideoLoaded);
  startTime = window.performance.now();
}

export function startLocalVideo() {
  trace("Requesting local stream.");
  return navigator.mediaDevices
    .getUserMedia(mediaStreamConstraints)
    .then((mediaStream) => {
      localVideo.srcObject = mediaStream;
      trace("Received local stream.");
      return mediaStream;
    });
}

export function stopLocalVideo() {
  trace("Stopping media.");
  if (localVideo.srcObject) {
    localVideo.srcObject.getTracks().forEach((track) => track.stop());
    localVideo.srcObject = null;
  }
}

export function setLocalPreviewVisible(visible) {
  if (!localVideo) return;
  localVideo.style.display = visible ? "block" : "none";
}

export function setupRemoteVideoEvents(videoElement) {
  videoElement.addEventListener("loadedmetadata", logVideoLoaded);
  videoElement.addEventListener("resize", logResizedVideo);
}


// Share screen functionality
export let _screenStream = null;

export function startScreenShare() {
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then((screenStream) => {
    // set preview to the screen stream and keep a reference so caller can stop it
    _screenStream = screenStream;
    localVideo.srcObject = screenStream;
    return screenStream;
  });
}

export function stopScreenShare() {
  if (_screenStream) {
    _screenStream.getTracks().forEach((t) => t.stop());
    _screenStream = null;
  }
}