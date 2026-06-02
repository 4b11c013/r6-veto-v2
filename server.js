const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));
// 加入這行：如果 GitHub 把檔案攤平了，也能從根目錄找到 index.html
app.use(express.static(__dirname));
app.use('/maps', express.static(__dirname));

// BO3 veto: T1ban T2ban T1ban T2ban T1pick T2pick → decider
const VETO = [
  {action:'ban',  team:'team1'},
  {action:'ban',  team:'team2'},
  {action:'ban',  team:'team1'},
  {action:'ban',  team:'team2'},
  {action:'pick', team:'team1'},
  {action:'pick', team:'team2'},
];

let S = {};

function loadMaps() {
  return fs.readdirSync(__dirname)
    .filter(f => /\.(jpg|jpeg|png|avif|webp)$/i.test(f))
    .map(f => ({ id:f, name:f.replace(/\.[^.]+$/,''), image:`/maps/${encodeURIComponent(f)}`, status:'available', by:null }));
}

function reset() {
  S = {
    phase: 'setup',       // setup | veto | side | done
    team1: { name:'TEAM 1', bans:[], pick:null },
    team2: { name:'TEAM 2', bans:[], pick:null },
    step: 0,
    maps: loadMaps(),
    decider: null,
    sideBy: null,         // who must pick side (team1/team2)
    sideGame: null,       // 1, 2, or 3
    games: [],            // [{game, mapId, name, sideBy, side}]
  };
}
reset();

io.on('connection', sock => {
  sock.emit('state', S);

  sock.on('start', ({t1, t2}) => {
    reset();
    S.team1.name = t1 || 'TEAM 1';
    S.team2.name = t2 || 'TEAM 2';
    S.phase = 'veto';
    io.emit('state', S);
  });

  sock.on('act', mapId => {
    if (S.phase !== 'veto') return;
    const step = VETO[S.step];
    if (!step) return;
    const map = S.maps.find(m => m.id === mapId && m.status === 'available');
    if (!map) return;

    map.by = step.team;

    if (step.action === 'ban') {
      map.status = 'banned';
      S[step.team].bans.push(mapId);
      S.step++;
      // check if veto done
      if (S.step >= VETO.length) finishVeto();
    } else {
      // pick
      map.status = 'picked';
      S[step.team].pick = mapId;
      const gameNum = step.team === 'team1' ? 1 : 2;
      S.games.push({ game: gameNum, mapId, name: map.name, sideBy: null, side: null });
      S.step++;
      // other team selects side
      const other = step.team === 'team1' ? 'team2' : 'team1';
      S.phase = 'side';
      S.sideBy = other;
      S.sideGame = gameNum;
    }
    io.emit('state', S);
  });

  sock.on('side', side => {
    if (S.phase !== 'side') return;
    const g = S.games.find(x => x.game === S.sideGame);
    if (g) { g.sideBy = S.sideBy; g.side = side; }

    const nextStep = VETO[S.step];
    if (nextStep) {
      S.phase = 'veto';
      S.sideBy = null;
      S.sideGame = null;
    } else {
      finishVeto();
    }
    io.emit('state', S);
  });

  sock.on('sideDecider', side => {
    if (S.phase !== 'side' || S.sideGame !== 3) return;
    const g = S.games.find(x => x.game === 3);
    if (g) { g.sideBy = S.sideBy; g.side = side; }
    S.phase = 'done';
    S.sideBy = null;
    io.emit('state', S);
  });

  sock.on('reset', () => { reset(); io.emit('state', S); });
});

function finishVeto() {
  const remaining = S.maps.filter(m => m.status === 'available');
  if (remaining[0]) {
    remaining[0].status = 'decider';
    S.decider = remaining[0].id;
    S.games.push({ game:3, mapId: remaining[0].id, name: remaining[0].name, sideBy:null, side:null });
  }
  // team1 chooses side for decider
  S.phase = 'side';
  S.sideBy = 'team1';
  S.sideGame = 3;
}

server.listen(PORT, () => {
  console.log(`\n🎮 R6 Map Veto: http://localhost:${PORT}\n`);
});
