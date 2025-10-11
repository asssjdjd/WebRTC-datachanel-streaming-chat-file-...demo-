"use strict";

import http from "http";
import { Server } from "socket.io";

const app = http.createServer();
const io = new Server(app, {
  cors: { origin: "*" },
});

app.listen(8080, () => {
  console.log("Signaling Server is listening on port 8080");
});

const rooms: Record<string, string[]> = {};

io.sockets.on("connection", (socket) => {
  socket.on("join-room", (roomID: string) => {
    const usersInThisRoom = rooms[roomID] || [];
    rooms[roomID] = [...usersInThisRoom, socket.id];
    socket.join(roomID);

    console.log(`User ${socket.id} joined room ${roomID}.`);

    socket.emit("all-users", usersInThisRoom);

    socket.to(roomID).emit("user-joined", socket.id);
  });

  socket.on("send-offer", (payload) => {
    io.to(payload.userToSignal).emit("offer-received", {
      signal: payload.signal,
      callerID: payload.callerID,
    });
  });

  socket.on("send-answer", (payload) => {
    io.to(payload.callerID).emit("answer-received", {
      signal: payload.signal,
      id: socket.id,
    });
  });

  socket.on("send-candidate", (payload) => {
    io.to(payload.userToSignal).emit("candidate-received", {
      signal: payload.signal,
      callerID: payload.callerID,
    });
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.id} disconnected.`);
    for (const roomID in rooms) {
      const newUsers = rooms[roomID].filter((id) => id !== socket.id);
      if (newUsers.length !== rooms[roomID].length) {
        rooms[roomID] = newUsers;
        socket.to(roomID).emit("user-left", socket.id);
        break;
      }
    }
  });
});
