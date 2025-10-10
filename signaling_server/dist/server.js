"use strict";
import http from "http";
import { Server } from "socket.io";
const app = http.createServer();

// allow CORS for simplicity
const io = new Server(app, {
  cors: { origin: "*" },
});

app.listen(8080, () => {
  console.log("Signaling Server is listening on port 8080");
});
// In-memory storage of rooms and their participants
const rooms = {};

io.sockets.on("connection", (socket) => {
  socket.on("join-room", (roomID) => {
    // Add user to the room

    const usersInThisRoom = rooms[roomID] || [];

    rooms[roomID] = [...usersInThisRoom, socket.id];
    socket.join(roomID);

    console.log(`User ${socket.id} joined room ${roomID}.`);
    // send to the new user the list of existing users
    socket.emit("all-users", usersInThisRoom);
    // notify existing users that a new user has joined
    socket.to(roomID).emit("user-joined", socket.id);
  });
  socket.on("send-offer", (payload) => {
    // Forward the offer to the intended recipient
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

  // Explicit leave-room so a client can leave without disconnecting the socket
  socket.on("leave-room", (roomID) => {
    if (!roomID) return;
    const usersInRoom = rooms[roomID] || [];
    const newUsers = usersInRoom.filter((id) => id !== socket.id);
    if (newUsers.length !== usersInRoom.length) {
      rooms[roomID] = newUsers;
      socket.leave(roomID);
      socket.to(roomID).emit("user-left", socket.id);
      console.log(`User ${socket.id} left room ${roomID}.`);
    }
  });

  // Screen sharing event handling
  socket.on("start-screen-share", (roomID) => {
    socket.to(roomID).emit("screen-share-started", socket.id);
  });

  socket.on("stop-screen-share", (roomID) => {
    socket.to(roomID).emit("screen-share-stopped", socket.id);
  });
  

});
