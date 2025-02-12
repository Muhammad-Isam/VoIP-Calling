const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

let users = {}; // Store connected users

wss.on("connection", (ws) => {
  console.log("New client connected");
  ws.isAlive = true;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Received:", data.type, "from", data.userId || "unknown");

      if (!data.userId) {
        ws.send(JSON.stringify({ type: "error", message: "User ID required" }));
        return;
      }

      switch (data.type) {
        case "register":
          if (users[data.userId]) {
            users[data.userId].close(); // Close previous connection if exists
          }
          users[data.userId] = ws;
          console.log(`Registered user: ${data.userId}`);

          // Send confirmation back to client
          ws.send(JSON.stringify({ type: "registrationConfirmed", userId: data.userId }));

          // Send active users list
          ws.send(JSON.stringify({ type: "activeUsers", users: Object.keys(users) }));
          break;

        case "call":
          console.log("Active users:", Object.keys(users));
          if (users[data.target]) {
            console.log(`Routing call to ${data.target}`);
            users[data.target].send(
              JSON.stringify({
                type: "incomingCall",
                from: data.userId,
                signal: data.signal,
              })
            );
          } else {
            console.error(`Target ${data.target} not found`);
            ws.send(JSON.stringify({ type: "callFailed", message: "User not found" }));
          }
          break;

        case "answer":
          if (users[data.target]) {
            console.log(`Sending answer to ${data.target}`);
            users[data.target].send(
              JSON.stringify({
                type: "callAccepted",
                signal: data.signal,
              })
            );
          }
          break;

        case "iceCandidate":
          if (users[data.target]) {
            users[data.target].send(
              JSON.stringify({
                type: "iceCandidate",
                candidate: data.candidate,
                from: data.userId,
              })
            );
          }
          break;

        case "heartbeat":
          ws.isAlive = true;
          break;

        default:
          console.warn("Unknown message type:", data.type);
      }
    } catch (error) {
      console.error("Message processing error:", error);
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    Object.keys(users).forEach((key) => {
      if (users[key] === ws) {
        delete users[key];
        console.log(`User ${key} removed`);
      }
    });
  });

  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

// Heartbeat check to remove dead connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
    } else {
      ws.isAlive = false;
      ws.ping();
    }
  });
}, 30000); // Check every 30 seconds

server.listen(5000, () => {
  console.log("WebSocket server running on port 5000");
});
