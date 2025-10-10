"use strict";

import { trace } from "./client.js";
import { handleFileMessage, sendFile } from "./file.js";

const chatButton = document.getElementById("chatButton");
const chatBox = document.getElementById("chatBox");
const chatArea = document.getElementById("chatArea");
const chatInput = document.getElementById("chatInput");
const sendMsg = document.getElementById("sendMsg");

let dataChannel;
let receiveChannel;

export function initChat() {
  chatButton.addEventListener("click", toggleChatBox);
  sendMsg.addEventListener("click", sendMessage);
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

function toggleChatBox() {
  chatBox.style.display = chatBox.style.display === "none" ? "block" : "none";
}

export function appendMessage(sender, message) {
  const div = document.createElement("div");
  div.innerHTML = `<b>${sender}:</b> ${message}`;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;

  const channel = dataChannel || receiveChannel;
  if (!channel || channel.readyState !== "open") {
    appendMessage("System", "❌ Data channel not ready");
    return;
  }

  appendMessage("You", msg);
  channel.send(JSON.stringify({ text: msg }));
  chatInput.value = "";
}

function handleDataMessage(event) {
  console.log("📨 Received data:", typeof event.data, event.data);

  if (typeof event.data === "string") {
    try {
      const data = JSON.parse(event.data);
      console.log("📋 Parsed JSON:", data);

      // File-related messages
      if (
        data.type &&
        (data.type.startsWith("file-") || data.type === "file")
      ) {
        handleFileMessage(data, chatArea);
      }
      // Regular text message
      else {
        appendMessage("Remote", data.text || event.data);
      }
    } catch (e) {
      // Plain text message
      console.log("💬 Plain text message");
      appendMessage("Remote", event.data);
    }
  } else {
    // Binary data (file chunk)
    handleFileMessage(event.data, chatArea);
  }
}

function handleDataChannelStatusChange() {
  const channel = dataChannel || receiveChannel;
  const readyState = channel ? channel.readyState : "undefined";
  trace(`Data channel state is: ${readyState}`);

  if (readyState === "open") {
    appendMessage("System", "✅ Chat connected");
  } else if (readyState === "closed") {
    appendMessage("System", "❌ Chat disconnected");
  }
}

export function setupDataChannels(localPeer, remotePeer) {
  // Create data channel on local peer
  if (localPeer) {
    dataChannel = localPeer.createDataChannel("chat");
    dataChannel.binaryType = "arraybuffer";
    dataChannel.onopen = handleDataChannelStatusChange;
    dataChannel.onclose = handleDataChannelStatusChange;
    dataChannel.onmessage = handleDataMessage;
  }

  // Receive data channel on remote peer
  if (remotePeer) {
    remotePeer.ondatachannel = (event) => {
      receiveChannel = event.channel;
      receiveChannel.binaryType = "arraybuffer";
      receiveChannel.onmessage = handleDataMessage;
      receiveChannel.onopen = handleDataChannelStatusChange;
      receiveChannel.onclose = handleDataChannelStatusChange;
    };
  }
}

export function getActiveChannel() {
  return dataChannel || receiveChannel;
}
