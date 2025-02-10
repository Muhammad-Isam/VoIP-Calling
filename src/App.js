import React, { useEffect, useState } from "react";
import SimplePeer from "simple-peer";

const App = () => {
  const [myId, setMyId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [stream, setStream] = useState(null);
  const [callStatus, setCallStatus] = useState("Disconnected");
  const socketRef = React.useRef(null);
  const peerRef = React.useRef(null);
  const streamRef = React.useRef();

  // Request microphone access on mount
  useEffect(() => {
    const getMedia = async () => {
      try {
        const userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStream(userStream);
        streamRef.current = userStream;
      } catch (error) {
        console.error("Error accessing microphone:", error);
      }
    };
    getMedia();
  }, []);

  // Establish WebSocket connection and register user (runs only once)
  useEffect(() => {
    const userId = Math.random().toString(36).substr(2, 6);
    setMyId(userId);

    // Make sure to use the correct WebSocket protocol (ws:// or wss://)
    const ws = new WebSocket("wss://3dc2-175-107-212-104.ngrok-free.app");
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send(JSON.stringify({ type: "register", userId }));
    };

    ws.onmessage = (message) => {
      const data = JSON.parse(message.data);
      console.log("Received message:", data);

      switch (data.type) {
        case "registrationConfirmed":
          console.log("Registration confirmed:", data.userId);
          break;
        case "incomingCall":
          setCallStatus(`Incoming call from ${data.from}`);
          if (!streamRef.current) {
            console.error("Local stream not available");
            return;
          }

          // Create a receiver peer
          const incomingPeer = new SimplePeer({
            initiator: false,
            trickle: false,
            stream: streamRef.current,
            config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
          });

          incomingPeer.signal(data.signal);

          incomingPeer.on("signal", (signalData) => {
            const sendAnswer = () => {
              ws.send(JSON.stringify({
                type: "answer",
                signal: signalData,
                target: data.from,
              }));
            };

            if (ws.readyState === WebSocket.OPEN) {
              sendAnswer();
            } else {
              ws.addEventListener("open", sendAnswer, { once: true });
            }
          });

          incomingPeer.on("stream", (remoteStream) => {
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.play().catch((e) => console.error("Audio play failed:", e));
            setCallStatus("Call connected");
          });

          peerRef.current = incomingPeer;
          break;
        case "callAccepted":
          if (peerRef.current) {
            peerRef.current.signal(data.signal);
            setCallStatus("Call connected");
          }
          break;
        case "callFailed":
          setCallStatus(`Call failed: ${data.message}`);
          break;
        default:
          console.warn("Unknown message type:", data.type);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setCallStatus("Disconnected");
    };

    return () => {
      if (ws) ws.close();
    };
  }, []);

  // Initiate a call when the "Call" button is clicked
  const startCall = () => {
    if (!streamRef.current) {
      console.error("Local stream not available");
      return;
    }

    setCallStatus("Calling...");

    // Create an initiator peer
    const newPeer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: streamRef.current,
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    });

    newPeer.on("signal", (data) => {
      const sendCall = () => {
        socketRef.current.send(JSON.stringify({
          type: "call",
          signal: data,
          target: targetId,
          userId: myId,
        }));
      };

      if (socketRef.current.readyState === WebSocket.OPEN) {
        sendCall();
      } else {
        socketRef.current.addEventListener("open", sendCall, { once: true });
      }
    });

    newPeer.on("stream", (remoteStream) => {
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play().catch((e) => console.error("Audio play failed:", e));
      setCallStatus("Call connected");
    });

    peerRef.current = newPeer;
  };

  return (
    <div>
      <h1>VoIP Web App (Audio Only)</h1>
      <p>Your ID: {myId}</p>
      <p>Status: {callStatus}</p>
      <input
        type="text"
        placeholder="Enter user ID to call"
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
      />
      <button onClick={startCall}>Call</button>
    </div>
  );
};

export default App;
