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

// BO3 veto: T1ban T2ban T1pick T2pick -> wait for G2 result -> G3 pick -> done
const VETO = [
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
    g2Winner: null,       // team1 or team2
    dynamicVeto: [...VETO] // copy of VETO, can add 3rd map pick
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
    S.dynamicVeto = [...VETO];
    io.emit('state', S);
  });

  sock.on('act', mapId => {
    if (S.phase !== 'veto') return;
    const step = S.dynamicVeto[S.step];
    if (!step) return;
    const map = S.maps.find(m => m.id === mapId && m.status === 'available');
    if (!map) return;

    map.by = step.team;

    if (step.action === 'ban') {
      map.status = 'banned';
      S[step.team].bans.push(mapId);
      S.step++;
      // check if veto done (shouldn't happen directly on ban now)
      if (S.step >= S.dynamicVeto.length) S.phase = 'done';
    } else {
      // pick
      map.status = 'picked';
      S[step.team].pick = mapId; // note: for G3, this will just overwrite or we don't strictly use S.team.pick for display if we have games array
      const gameNum = S.games.length + 1;
      S.games.push({ game: gameNum, mapId, name: map.name, sideBy: null, side: null });
      S.step++;
      
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

    if (S.step < S.dynamicVeto.length) {
      S.phase = 'veto';
    } else {
      // If we finished the first 4 steps, wait for G2 result
      if (S.games.length === 2) {
        S.phase = 'g2_result';
      } else {
        S.phase = 'done';
      }
    }
    S.sideBy = null;
    S.sideGame = null;
    io.emit('state', S);
  });

  sock.on('g2Result', winner => {
    if (S.phase !== 'g2_result') return;
    S.g2Winner = winner;
    S.phase = 'g3_choice';
    io.emit('state', S);
  });

  sock.on('g3Choice', choice => {
    // choice is 'map' or 'side'
    if (S.phase !== 'g3_choice') return;
    const otherTeam = S.g2Winner === 'team1' ? 'team2' : 'team1';
    
    if (choice === 'map') {
      // Winner picks map, other picks side
      S.dynamicVeto.push({ action: 'pick', team: S.g2Winner });
    } else {
      // Winner picks side, meaning other picks map
      S.dynamicVeto.push({ action: 'pick', team: otherTeam });
    }
    S.phase = 'veto';
    io.emit('state', S);
  });

  sock.on('reset', () => { reset(); io.emit('state', S); });
});

server.listen(PORT, () => {
  console.log(`\n🎮 R6 Map Veto: http://localhost:${PORT}\n`);
});
