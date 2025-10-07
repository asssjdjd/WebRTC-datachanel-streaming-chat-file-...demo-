'use strict';

import { trace } from './main.js';

const mediaStreamConstraints = {
  video: true,
  audio: false,
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let startTime = null;

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

export function initVideo() {
  localVideo.addEventListener('loadedmetadata', logVideoLoaded);
  remoteVideo.addEventListener('loadedmetadata', logVideoLoaded);
  remoteVideo.addEventListener('resize', logResizedVideo);
  
  startTime = window.performance.now();
}

export function startLocalVideo() {
  trace('Requesting local stream.');
  return navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
    .then((mediaStream) => {
      localVideo.srcObject = mediaStream;
      trace('Received local stream.');
      return mediaStream;
    });
}

export function stopLocalVideo() {
  trace('Stopping media.');
  if (localVideo.srcObject) {
    localVideo.srcObject.getTracks().forEach((track) => track.stop());
    localVideo.srcObject = null;
  }
  remoteVideo.srcObject = null;
}