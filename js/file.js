'use strict';

import { trace } from './main.js';
import { appendMessage, getActiveChannel } from './chat.js';

const sendFileBtn = document.getElementById('sendFile');
const fileInput = document.getElementById('fileInput');

const CHUNK_SIZE = 16384; // 16KB chunks

// File transfer state
let fileReader;
let receiveBuffer = [];
let receivedSize = 0;
let fileMetadata = null;

export function initFileTransfer() {
  sendFileBtn.addEventListener('click', sendFile);
}

export function sendFile() {
  const file = fileInput.files[0];
  if (!file) {
    appendMessage('System', '❌ Please select a file');
    return;
  }
  
  const channel = getActiveChannel();
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
    mimeType: file.type
  }));
  
  // Send file in chunks
  let offset = 0;
  fileReader = new FileReader();
  
  fileReader.addEventListener('error', error => {
    appendMessage('System', `❌ File read error: ${error}`);
  });
  
  fileReader.addEventListener('abort', () => {
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

export function handleFileMessage(data, chatArea) {
  // Handle JSON messages
  if (typeof data === 'object' && data.type) {
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
        mimeType: data.mimeType || (fileMetadata ? fileMetadata.mimeType : 'application/octet-stream')
      };
      
      console.log('📄 File info:', meta);
      
      const received = new Blob(receiveBuffer, { type: meta.mimeType });
      const url = URL.createObjectURL(received);
      console.log('🔗 Blob URL created:', url);
      
      createDownloadButton(chatArea, meta, url);
      
      receiveBuffer = [];
      receivedSize = 0;
      fileMetadata = null;
    }
  }
  // Handle binary data (file chunks)
  else if (data instanceof ArrayBuffer) {
    console.log('📦 Binary chunk received:', data.byteLength, 'bytes');
    receiveBuffer.push(data);
    receivedSize += data.byteLength;
    
    if (fileMetadata) {
      const progress = ((receivedSize / fileMetadata.size) * 100).toFixed(1);
      trace(`Receiving file: ${progress}% (${formatBytes(receivedSize)}/${formatBytes(fileMetadata.size)})`);
    }
  }
}

function createDownloadButton(chatArea, meta, url) {
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
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Initialize on load
initFileTransfer();