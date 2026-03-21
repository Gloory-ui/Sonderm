/**
 * Sonderm WebRTC: аудио/видео через Socket.io-сигналинг.
 * Ожидает state.socket и колбэки UI из app.js (window.SondermCallUi).
 */
(function () {
  const ICE = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  let socket = null;
  let pc = null;
  let localStream = null;
  let callId = null;
  let role = null;
  let pendingInvite = null;
  let timerInt = null;
  let startedAt = null;

  function getUi() {
    return window.SondermCallUi || {};
  }

  function fmtDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function startTimer() {
    stopTimer();
    startedAt = Date.now();
    timerInt = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      const el = document.getElementById("callTimer");
      if (el) el.textContent = fmtDuration(sec);
    }, 500);
  }

  function stopTimer() {
    if (timerInt) clearInterval(timerInt);
    timerInt = null;
    startedAt = null;
  }

  async function ensureLocalStream(withVideo) {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: withVideo ? { facingMode: "user" } : false,
    });
    const lv = document.getElementById("callLocalVideo");
    if (lv) {
      lv.srcObject = localStream;
      lv.muted = true;
      lv.playsInline = true;
      try {
        await lv.play();
      } catch (_) {}
    }
    return localStream;
  }

  function cleanup() {
    stopTimer();
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    const rv = document.getElementById("callRemoteVideo");
    if (rv) {
      rv.srcObject = null;
    }
    const lv = document.getElementById("callLocalVideo");
    if (lv) lv.srcObject = null;
    callId = null;
    role = null;
    pendingInvite = null;
    getUi().hideCallOverlay?.();
  }

  function bindPcHandlers() {
    pc.onicecandidate = (ev) => {
      if (ev.candidate && callId) {
        socket.emit("call_ice", { callId, candidate: ev.candidate });
      }
    };
    pc.ontrack = (ev) => {
      const rv = document.getElementById("callRemoteVideo");
      if (!rv) return;
      if (!rv.srcObject) rv.srcObject = new MediaStream();
      rv.srcObject.addTrack(ev.track);
      rv.playsInline = true;
      rv.style.display = "block";
      if (ev.track.kind === "audio") {
        rv.style.maxHeight = "2px";
        rv.style.opacity = "0";
      } else {
        rv.style.maxHeight = "";
        rv.style.opacity = "";
      }
      rv.play().catch(() => {});
      startTimer();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        endCallLocal();
      }
    };
  }

  async function createPcAsCaller(withVideo) {
    await ensureLocalStream(withVideo);
    pc = new RTCPeerConnection(ICE);
    bindPcHandlers();
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }

  async function createPcAsCallee(withVideo, offer) {
    await ensureLocalStream(withVideo);
    pc = new RTCPeerConnection(ICE);
    bindPcHandlers();
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }

  async function startOutgoing(chatId, type) {
    if (!socket) return;
    const withVideo = type === "video";
    try {
      callId = crypto.randomUUID();
      role = "caller";
      const offer = await createPcAsCaller(withVideo);
      socket.emit("call_invite", {
        callId,
        chatId,
        type,
        sdpOffer: offer,
      });
      getUi().showOutgoing?.(type);
    } catch (e) {
      console.error(e);
      alert("Не удалось начать звонок: " + (e.message || e));
      cleanup();
    }
  }

  async function acceptIncoming() {
    const payload = pendingInvite;
    if (!socket || !payload?.callId || !payload?.sdpOffer) return;
    callId = payload.callId;
    role = "callee";
    const withVideo = payload.type === "video";
    try {
      const answer = await createPcAsCallee(withVideo, payload.sdpOffer);
      socket.emit("call_answer", { callId, sdpAnswer: answer });
      getUi().showActive?.(payload.type);
    } catch (e) {
      console.error(e);
      socket.emit("call_end", { callId });
      cleanup();
    }
  }

  function rejectIncoming() {
    const id = pendingInvite?.callId || callId;
    if (id) socket?.emit("call_reject", { callId: id });
    cleanup();
  }

  function endCallLocal() {
    if (callId) socket?.emit("call_end", { callId });
    cleanup();
  }

  function attachSocket(sock) {
    socket = sock;
    socket.off("call_incoming");
    socket.off("call_answer_remote");
    socket.off("call_ice_remote");
    socket.off("call_ended");
    socket.off("call_rejected");

    socket.on("call_incoming", (payload) => {
      pendingInvite = payload;
      callId = payload.callId;
      role = "callee";
      getUi().showIncoming?.(payload);
    });

    socket.on("call_answer_remote", async (payload) => {
      if (!payload?.sdpAnswer || !pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdpAnswer));
        getUi().showActive?.(payload.type || "audio");
        startTimer();
      } catch (e) {
        console.error(e);
      }
    });

    socket.on("call_ice_remote", async (payload) => {
      if (!pc || !payload?.candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (_) {}
    });

    socket.on("call_ended", () => {
      cleanup();
    });

    socket.on("call_rejected", () => {
      alert("Абонент отклонил вызов");
      cleanup();
    });
  }

  window.SondermWebRTC = {
    attachSocket,
    startOutgoing,
    acceptIncoming,
    rejectIncoming,
    endCallLocal,
    cleanup,
    get callId() {
      return callId;
    },
  };
})();
