const socket = io();

const joinBtn = document.getElementById("join-btn");
const nicknameInput = document.getElementById("nickname-input");
const roomInput = document.getElementById("room-input");
const lobby = document.getElementById("lobby");
const gameContainer = document.getElementById("game-container");

const messages = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const leaderboard = document.getElementById("leaderboard");
const currentWordDisplay = document.getElementById("current-word");
const roundTimerDisplay = document.getElementById("round-timer");

const canvas = document.getElementById("drawing-board");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let prevX = 0;
let prevY = 0;

let drawerId = null;
let myId = null;
let currentRoom = null;
let currentWord = "";

function addMessage(text, isSystem = false) {
  const div = document.createElement("div");
  div.textContent = text;
  if (isSystem) {
    div.style.fontStyle = "italic";
    div.style.color = "#555";
  }
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function updateLeaderboard(players) {
  leaderboard.innerHTML = "<h3>🏆 Leaderboard</h3>";
  players.forEach(({ nickname, score }) => {
    const p = document.createElement("p");
    p.textContent = `${nickname}: ${score}`;
    leaderboard.appendChild(p);
  });
}

function setCurrentWord(word, isDrawer) {
  if (isDrawer) {
    currentWordDisplay.textContent = `Your word: ${word}`;
  } else {
    currentWordDisplay.textContent = `Guess the word: ${"_ ".repeat(word.length).trim()}`;
  }
}

function enableDrawing(enable) {
  if (enable) {
    canvas.style.cursor = "crosshair";
  } else {
    canvas.style.cursor = "not-allowed";
  }
}

joinBtn.addEventListener("click", () => {
  const nickname = nicknameInput.value.trim();
  const room = roomInput.value.trim();

  if (!nickname || !room) {
    alert("Please enter both nickname and room.");
    return;
  }

  socket.emit("joinRoom", { nickname, room });

  lobby.style.display = "none";
  gameContainer.style.display = "flex";

  currentRoom = room;
  myId = socket.id;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  messages.innerHTML = "";
  leaderboard.innerHTML = "<h3>🏆 Leaderboard</h3>";
  currentWordDisplay.textContent = "";
  roundTimerDisplay.textContent = "Time Left: 60s";

  enableDrawing(false);
});

// Drawing events
canvas.addEventListener("mousedown", (e) => {
  if (socket.id !== drawerId) return;
  isDrawing = true;
  prevX = e.offsetX;
  prevY = e.offsetY;
});

canvas.addEventListener("mouseup", () => {
  isDrawing = false;
  prevX = 0;
  prevY = 0;
});

canvas.addEventListener("mouseout", () => {
  isDrawing = false;
  prevX = 0;
  prevY = 0;
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing || socket.id !== drawerId) return;

  const x = e.offsetX;
  const y = e.offsetY;

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(prevX, prevY);
  ctx.lineTo(x, y);
  ctx.stroke();

  socket.emit("drawing", { prevX, prevY, x, y });

  prevX = x;
  prevY = y;
});

// Receive drawing data
socket.on("drawing", (data) => {
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(data.prevX, data.prevY);
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
});

// Update player list and leaderboard
socket.on("updatePlayers", (players) => {
  updateLeaderboard(players);
});

// Handle start of round (both for drawer and guessers)
socket.on("startRound", ({ drawerId: dId, wordLength, drawerName }) => {
  drawerId = dId;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (socket.id === drawerId) {
    addMessage(`You are the drawer! Waiting to choose a word...`, true);
    currentWordDisplay.textContent = "";
    enableDrawing(false);
  } else {
    addMessage(`${drawerName} is drawing now. Start guessing!`, true);
    currentWordDisplay.textContent = `Guess the word: ${"_ ".repeat(wordLength).trim()}`;
    enableDrawing(false);
  }
});

// Drawer chooses a word from options
socket.on("chooseWord", (wordOptions) => {
  const choice = prompt(`Choose a word to draw:\n${wordOptions.join(", ")}`);
  if (wordOptions.includes(choice)) {
    socket.emit("wordChosen", choice);
    currentWord = choice;
    currentWordDisplay.textContent = `Your word: ${choice}`;
    enableDrawing(true);
    addMessage(`You chose: ${choice}`, true);
  } else {
    // If invalid or canceled, pick the first word by default
    socket.emit("wordChosen", wordOptions[0]);
    currentWord = wordOptions[0];
    currentWordDisplay.textContent = `Your word: ${wordOptions[0]}`;
    enableDrawing(true);
    addMessage(`No valid choice made. Defaulting to: ${wordOptions[0]}`, true);
  }
});

// Timer update
socket.on("timer", (timeLeft) => {
  roundTimerDisplay.textContent = `Time Left: ${timeLeft}s`;
});

// New chat message or guess
socket.on("message", ({ nickname, text }) => {
  addMessage(`${nickname}: ${text}`);
});

// Correct guess
socket.on("correctGuess", ({ nickname, word }) => {
  addMessage(`🎉 ${nickname} guessed the word correctly! The word was: ${word}`, true);
  currentWordDisplay.textContent = "";
  enableDrawing(false);
});

// Round ended
socket.on("roundEnd", (word) => {
  addMessage(`⏰ Round ended! The word was: ${word}`, true);
  currentWordDisplay.textContent = "";
  enableDrawing(false);
});

// Chat form submit
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;

  // Drawer cannot guess
  if (socket.id === drawerId) {
    addMessage("You cannot guess while drawing!", true);
    chatInput.value = "";
    return;
  }

  socket.emit("chatMessage", msg);
  chatInput.value = "";
});