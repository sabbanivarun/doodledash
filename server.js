const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const PORT = 3000;

let rooms = {};

const words = ["apple", "banana", "car", "house", "guitar", "elephant", "sun", "mountain", "river", "pizza"];

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("joinRoom", ({ nickname, room }) => {
    socket.join(room);
    socket.nickname = nickname;
    socket.room = room;

    if (!rooms[room]) {
      rooms[room] = {
        players: [],
        drawerIndex: 0,
        currentWord: "",
        roundTime: 60,
        inProgress: false,
        scores: {},
        roundTimer: null,
        waitingForWordChoice: false,
      };
    }

    const game = rooms[room];

    // Add player if not already present
    if (!game.players.find((p) => p.id === socket.id)) {
      game.players.push({ id: socket.id, nickname });
    }

    game.scores[socket.id] = game.scores[socket.id] || 0;

    io.to(room).emit("updatePlayers", game.players.map(p => ({
      nickname: p.nickname,
      score: game.scores[p.id]
    })));

    // Start game only if enough players and not in progress
    if (!game.inProgress && game.players.length >= 2) {
      startRound(room);
    }
  });

  // Handle when drawer chooses a word
  socket.on("wordChosen", (word) => {
    const room = socket.room;
    if (!room || !rooms[room]) return;

    const game = rooms[room];
    if (!game.waitingForWordChoice) return;

    game.currentWord = word;
    game.waitingForWordChoice = false;

    io.to(room).emit("startRound", {
      drawerId: game.players[game.drawerIndex].id,
      wordLength: word.length,
      drawerName: game.players[game.drawerIndex].nickname
    });

    startTimer(room);
  });

  socket.on("chatMessage", (msg) => {
    const room = socket.room;
    if (!room || !rooms[room]) return;

    const game = rooms[room];
    const currentWord = game.currentWord;
    if (!currentWord) return;

    if (msg.toLowerCase().trim() === currentWord.toLowerCase()) {
      // Correct guess
      game.scores[socket.id] += 10;
      io.to(room).emit("correctGuess", { nickname: socket.nickname, word: currentWord });
      clearInterval(game.roundTimer);
      endRound(room);
    } else {
      io.to(room).emit("message", { nickname: socket.nickname, text: msg });
    }
  });

  socket.on("drawing", (data) => {
    socket.broadcast.to(socket.room).emit("drawing", data);
  });

  socket.on("disconnect", () => {
    const room = socket.room;
    if (!room || !rooms[room]) return;

    const game = rooms[room];
    game.players = game.players.filter(p => p.id !== socket.id);
    delete game.scores[socket.id];

    if (game.players.length === 0) {
      delete rooms[room];
    } else {
      io.to(room).emit("updatePlayers", game.players.map(p => ({
        nickname: p.nickname,
        score: game.scores[p.id]
      })));

      // If drawer disconnected, end round and move on
      if (game.players[game.drawerIndex]?.id === socket.id) {
        clearInterval(game.roundTimer);
        endRound(room);
      }
    }
  });
});

function startRound(room) {
  const game = rooms[room];
  if (!game) return;

  game.inProgress = true;
  game.currentWord = "";
  game.waitingForWordChoice = true;

  if (game.drawerIndex >= game.players.length) game.drawerIndex = 0;

  const drawer = game.players[game.drawerIndex];

  // Send word options to the drawer for selection
  const wordOptions = [];
  while(wordOptions.length < 3) {
    const randomWord = words[Math.floor(Math.random() * words.length)];
    if (!wordOptions.includes(randomWord)) wordOptions.push(randomWord);
  }
  io.to(drawer.id).emit("chooseWord", wordOptions);

  // Inform others who the drawer is, but don't show word yet
  socket.to(room).emit("startRound", {
    drawerId: drawer.id,
    wordLength: 0,
    drawerName: drawer.nickname
  });
}

function startTimer(room) {
  const game = rooms[room];
  if (!game) return;

  let timeLeft = game.roundTime;

  game.roundTimer = setInterval(() => {
    io.to(room).emit("timer", timeLeft);
    timeLeft--;

    if (timeLeft < 0) {
      clearInterval(game.roundTimer);
      endRound(room);
    }
  }, 1000);
}

function endRound(room) {
  const game = rooms[room];
  if (!game) return;

  game.inProgress = false;

  io.to(room).emit("roundEnd", game.currentWord);

  // Prepare next round
  game.drawerIndex = (game.drawerIndex + 1) % game.players.length;

  setTimeout(() => {
    if (game.players.length >= 2) {
      startRound(room);
    }
  }, 5000);
}

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});