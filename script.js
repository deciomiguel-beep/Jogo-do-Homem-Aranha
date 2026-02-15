// script.js — Versão para computador com sistema de dificuldade
window.addEventListener('DOMContentLoaded', () => {

  // ========================
  // ELEMENTOS DO DOM
  // ========================
  const helpBtn = document.getElementById('help-btn');
  const playBtn = document.getElementById('play-btn');
  const introScreen = document.getElementById('intro-screen');
  const gameBoard = document.getElementById('game-board');
  const difficultySelector = document.getElementById('difficulty-selector');
  const spider = document.getElementById('spider');
  let venom = document.getElementById('venom');
  const venomFly = document.getElementById('venom-fly');
  const scoreDisplay = document.getElementById('score');

  // ========================
  // SISTEMA DE DIFICULDADE
  // ========================
  let difficulty = 'easy';
  const difficultySettings = {
    easy: {
      name: 'Fácil',
      venomSpeed: 4.5,
      flySpeed: 5.5,
      powerups: false,
      doubleVenomAt: 50,
      flyEnabled: false,
      description: '1 vilão, 2 vilões após 50 pontos'
    },
    medium: {
      name: 'Médio',
      venomSpeed: 3.2,
      flySpeed: 4.0,
      powerups: true,
      doubleVenomAt: 30,
      flyEnabled: false,
      description: '2 vilões + power ups'
    },
    hard: {
      name: 'Difícil',
      venomSpeed: 2.2,
      flySpeed: 3.0,
      powerups: true,
      doubleVenomAt: 20,
      flyEnabled: true,
      description: '2 vilões + power ups + vilão voador'
    }
  };

  // ========================
  // VARIÁVEIS DO JOGO
  // ========================
  let gameLoop = null;
  let flyTimer = null;
  let powerupSpawnTimer = null;
  let score = 0;
  let gameOver = false;
  let paused = false;
  let deathCount = 0;
  let highScore = parseInt(localStorage.getItem('highScore')) || 0;
  let doubleVenom = false;
  let venom2 = null;
  let lastRPress = 0;
  let jumpCount = 0;
  let phase = 1;
  
  // Powerups
  let powerupElement = null;
  let invincibleUntil = 0;
  let slowUntil = 0;

  // ========================
  // MÚSICA
  // ========================
  const musicPaths = [
    './music1.mp3',
    './music2.mp3',
    './music3.mp3',
    './music4.mp3'
  ];
  let currentMusicIndex = 0;
  let bgMusic = null;

  function playNextMusic() {
    if (bgMusic) {
      bgMusic.onended = null;
      try { bgMusic.pause(); } catch(e) {}
    }
    bgMusic = new Audio(musicPaths[currentMusicIndex]);
    bgMusic.volume = 0.45;
    bgMusic.play().catch(()=>{});
    bgMusic.onended = () => {
      currentMusicIndex = (currentMusicIndex + 1) % musicPaths.length;
      playNextMusic();
    };
  }

  // ========================
  // RANKING
  // ========================
  function getRanking() {
    return JSON.parse(localStorage.getItem('localRanking') || '[]');
  }
  function saveRanking(scoreToSave) {
    const arr = getRanking();
    arr.push({ score: scoreToSave, date: new Date().toISOString() });
    arr.sort((a,b)=> b.score - a.score);
    const top = arr.slice(0,5);
    localStorage.setItem('localRanking', JSON.stringify(top));
    return top;
  }

  // ========================
  // HELPER: garantir elementos visíveis
  // ========================
  function ensureVisible(el) {
    if (!el) return;
    el.style.display = 'block';
    el.style.opacity = '1';
    el.style.visibility = 'visible';
  }

  function ensureHidden(el) {
    if (!el) return;
    el.style.display = 'none';
  }

  // ========================
  // POWERUPS
  // ========================
  function createPowerup(type) {
    if (powerupElement || gameOver || paused) return;
    if (!gameBoard || !spider) return;
    
    const pu = document.createElement('div');
    pu.className = 'powerup ' + type;
    pu.dataset.type = type;
    pu.textContent = type === 'bonus' ? '+50' : (type === 'shield' ? '🛡️' : '🐢');
    pu.style.position = 'absolute';
    pu.style.right = '-80px';
    pu.style.bottom = (Math.random() * 200 + 80) + 'px';
    pu.style.pointerEvents = 'none';
    gameBoard.appendChild(pu);
    powerupElement = pu;

    const settings = difficultySettings[difficulty];
    const total = settings.venomSpeed * 2000;
    const start = performance.now();
    
    function tick(t) {
      if (!powerupElement || gameOver) return;
      if (paused) { requestAnimationFrame(tick); return; }
      
      const elapsed = t - start;
      const pct = elapsed / total;
      const boardWidth = gameBoard.getBoundingClientRect().width || 800;
      const x = -80 + pct * (boardWidth + 160);
      powerupElement.style.right = x + 'px';
      
      if (elementCollides(spider, powerupElement)) {
        applyPowerup(powerupElement.dataset.type);
        if (powerupElement.parentElement) powerupElement.remove();
        powerupElement = null;
        return;
      }
      
      if (pct < 1) requestAnimationFrame(tick);
      else { 
        if (powerupElement && powerupElement.parentElement) { 
          powerupElement.remove(); 
          powerupElement = null; 
        } 
      }
    }
    requestAnimationFrame(tick);
  }

  function applyPowerup(type) {
    if (type === 'bonus') {
      score += 50;
      updateScoreDisplay();
      showFeedback('+50 PONTOS!');
    } else if (type === 'shield') {
      invincibleUntil = Date.now() + 6000;
      spider.style.filter = 'hue-rotate(180deg)';
      showFeedback('🛡️ ESCUDO (6s)');
      setTimeout(() => { spider.style.filter = ''; }, 6000);
    } else if (type === 'slow') {
      slowUntil = Date.now() + 6000;
      updateEnemySpeeds();
      showFeedback('🐢 LENTO (6s)');
      setTimeout(() => { 
        slowUntil = 0;
        updateEnemySpeeds();
      }, 6100);
    }
  }

  function showFeedback(text) {
    if (!gameBoard) return;
    const f = document.createElement('div');
    f.className = 'powerup-feedback';
    f.textContent = text;
    gameBoard.appendChild(f);
    setTimeout(()=> { if (f.parentElement) f.remove(); }, 1600);
  }

  // ========================
  // CRIAR VENOM (segundo vilão)
  // ========================
  function criarVenom(offset, duration = null) {
    const v = document.createElement('img');
    v.src = './venom.png';
    v.className = 'venom2';
    v.style.position = 'absolute';
    v.style.bottom = '0px';
    v.style.right = offset + 'px';
    v.style.width = '90px';
    v.style.zIndex = '2';
    v.style.pointerEvents = 'auto';
    ensureVisible(v);
    return v;
  }

  function getCurrentVenomSpeed() {
    const base = difficultySettings[difficulty].venomSpeed;
    const slowed = (Date.now() < slowUntil);
    return slowed ? base * 2 : base;
  }

  function getCurrentFlySpeed() {
    const base = difficultySettings[difficulty].flySpeed;
    const slowed = (Date.now() < slowUntil);
    return slowed ? base * 2 : base;
  }

  // ========================
  // ATUALIZAR VELOCIDADES
  // ========================
  function updateEnemySpeeds() {
    const venSpeed = getCurrentVenomSpeed();
    const flySpeed = getCurrentFlySpeed();
    
    // Venom principal
    venom = document.getElementById('venom') || venom;
    if (venom) {
      ensureVisible(venom);
      venom.style.animation = `venom-move ${venSpeed}s linear infinite`;
      venom.style.animationPlayState = paused ? 'paused' : 'running';
    }
    
    // Venom 2 (se existir)
    if (venom2) {
      ensureVisible(venom2);
      venom2.style.animation = `venom-move ${venSpeed}s linear infinite`;
      venom2.style.animationPlayState = paused ? 'paused' : 'running';
    }
    
    // Vilão voador
    const settings = difficultySettings[difficulty];
    if (venomFly && settings.flyEnabled) {
      ensureVisible(venomFly);
      venomFly.style.animation = `venom-fly-move ${flySpeed}s linear`;
      venomFly.style.animationPlayState = paused ? 'paused' : 'running';
    } else if (venomFly) {
      ensureHidden(venomFly);
    }
  }

  function updateScoreDisplay() {
    if (!scoreDisplay) return;
    const diffName = difficultySettings[difficulty].name;
    scoreDisplay.textContent = `Dificuldade: ${diffName} | Score: ${score} | Recorde: ${highScore}`;
  }

  // ========================
  // DETECÇÃO DE COLISÃO
  // ========================
  function elementCollides(elA, elB) {
    if (!elA || !elB) return false;
    
    const styleA = getComputedStyle(elA);
    const styleB = getComputedStyle(elB);
    
    if (!styleB || !styleA) return false;
    if (styleB.display === 'none' || parseFloat(styleB.opacity) === 0) return false;
    if (styleA.display === 'none' || parseFloat(styleA.opacity) === 0) return false;
    if (elB.offsetWidth === 0 || elB.offsetHeight === 0) return false;
    if (elA.offsetWidth === 0 || elA.offsetHeight === 0) return false;

    const a = elA.getBoundingClientRect();
    const b = elB.getBoundingClientRect();

    return a.left < b.right && a.right > b.left && a.bottom > b.top && a.top < b.bottom;
  }

  // ========================
  // INICIAR JOGO
  // ========================
  function startGame() {
    // Limpar telas anteriores
    const old = document.querySelector('.game-over');
    if (old) old.remove();
    removePauseOverlay();

    // Limpar timers
    clearInterval(gameLoop);
    clearInterval(flyTimer);
    clearInterval(powerupSpawnTimer);

    // Limpar vilões antigos
    document.querySelectorAll('.venom2').forEach(n => n.remove());
    venom2 = null;

    // Resetar variáveis
    score = 0;
    gameOver = false;
    paused = false;
    doubleVenom = false;
    jumpCount = 0;
    invincibleUntil = 0;
    slowUntil = 0;
    phase = 1;

    // Limpar powerup
    if (powerupElement && powerupElement.parentElement) powerupElement.remove();
    powerupElement = null;

    // Resetar spider
    if (spider) {
      spider.src = './spiderman.gif';
      spider.style.animation = '';
      spider.style.filter = '';
      spider.classList.remove('jump', 'double-jump');
    }
    
    updateScoreDisplay();

    // Mostrar tela de jogo
    if (introScreen) introScreen.classList.add('hidden');
    if (difficultySelector) difficultySelector.classList.add('hidden');
    if (gameBoard) gameBoard.classList.remove('hidden');

    // Referência do venom
    venom = document.getElementById('venom') || venom;
    ensureVisible(venom);

    // Atualizar velocidades iniciais
    updateEnemySpeeds();

    // Timer do vilão voador (se habilitado)
    const settings = difficultySettings[difficulty];
    if (settings.flyEnabled) {
      flyTimer = setInterval(() => {
        if (gameOver || paused) return;
        
        if (venomFly) {
          ensureVisible(venomFly);
          venomFly.style.animation = 'none';
          void venomFly.offsetWidth;
          venomFly.style.animation = `venom-fly-move ${getCurrentFlySpeed()}s linear`;
          venomFly.style.animationPlayState = paused ? 'paused' : 'running';

          // Esconder após animação
          setTimeout(() => {
            if (!gameOver && venomFly) {
              ensureHidden(venomFly);
            }
          }, (getCurrentFlySpeed() * 1000) + 200);
        }
      }, 3500);
    }

    // Timer de powerups
    if (settings.powerups) {
      powerupSpawnTimer = setInterval(() => {
        if (gameOver || paused) return;
        if (Math.random() < 0.6) {
          const types = ['bonus', 'shield', 'slow'];
          const t = types[Math.floor(Math.random() * types.length)];
          createPowerup(t);
        }
      }, 3500);
    }

    // Loop principal do jogo
    gameLoop = setInterval(() => {
      if (gameOver || paused) return;

      // Atualizar velocidades
      updateEnemySpeeds();

      // Atualizar referência do venom
      venom = document.getElementById('venom') || venom;

      // Verificar colisão com venom principal
      if (venom && elementCollides(spider, venom) && Date.now() > invincibleUntil) {
        return gameOverHandler();
      }

      // Verificar colisão com venom2
      if (doubleVenom && venom2 && elementCollides(spider, venom2) && Date.now() > invincibleUntil) {
        return gameOverHandler();
      }

      // Verificar colisão com vilão voador
      if (venomFly && settings.flyEnabled) {
        const flyStyle = getComputedStyle(venomFly);
        if (flyStyle.display !== 'none' && flyStyle.visibility !== 'hidden' && parseFloat(flyStyle.opacity) > 0) {
          if (elementCollides(spider, venomFly) && Date.now() > invincibleUntil) {
            return gameOverHandler();
          }
        }
      }

      // Incrementar score
      score++;
      updateScoreDisplay();

      // Ativar segundo vilão baseado na dificuldade
      const doubleVenomScore = settings.doubleVenomAt;
      if (score >= doubleVenomScore && !doubleVenom) {
        doubleVenom = true;
        document.querySelectorAll('.venom2').forEach(n => n.remove());
        venom2 = criarVenom(-600);
        if (gameBoard) gameBoard.appendChild(venom2);
        updateEnemySpeeds();
      }

    }, 100);
  }

  // ========================
  // GAME OVER
  // ========================
  function gameOverHandler() {
    if (gameOver) return;
    gameOver = true;
    deathCount++;

    if (score > highScore) {
      highScore = score;
      localStorage.setItem('highScore', highScore);
    }

    // PARAR todas as animações - congelar vilões
    clearInterval(gameLoop);
    clearInterval(flyTimer);
    clearInterval(powerupSpawnTimer);
    
    // Congelar vilão principal
    if (venom) {
      venom.style.animationPlayState = 'paused';
      const venomStyle = window.getComputedStyle(venom);
      const venomRight = venomStyle.right;
      venom.style.animation = 'none';
      venom.style.right = venomRight;
    }
    
    // Congelar segundo vilão
    if (venom2) {
      venom2.style.animationPlayState = 'paused';
      const venom2Style = window.getComputedStyle(venom2);
      const venom2Right = venom2Style.right;
      venom2.style.animation = 'none';
      venom2.style.right = venom2Right;
    }
    
    // Congelar vilão voador
    if (venomFly) {
      venomFly.style.animationPlayState = 'paused';
      const flyStyle = window.getComputedStyle(venomFly);
      const flyRight = flyStyle.right;
      const flyBottom = flyStyle.bottom;
      venomFly.style.animation = 'none';
      venomFly.style.right = flyRight;
      venomFly.style.bottom = flyBottom;
    }

    // Trocar imagem do spider para morto
    if (spider) {
      spider.style.animation = 'none';
      spider.style.animationPlayState = 'paused';
      spider.src = './spider-dead.png';
    }

    const rankingTop = saveRanking(score);

    const old = document.querySelector('.game-over');
    if (old) old.remove();

    const box = document.createElement('div');
    box.className = 'game-over';

    let rankHtml = '<ol style="text-align:left;margin-left:1rem;">';
    rankingTop.forEach(r => {
      const d = new Date(r.date);
      rankHtml += `<li>${r.score} — ${d.toLocaleDateString()}</li>`;
    });
    rankHtml += '</ol>';

    box.innerHTML = `
      💀 <strong>GAME OVER</strong><br><br>
      Pontuação: ${score}<br>
      Recorde: ${highScore}<br>
      Mortes: ${deathCount}<br><br>
      <details style="margin:8px 0;"><summary style="cursor:pointer">Top ${rankingTop.length}</summary>
        ${rankHtml}
      </details>
      <br>Pressione <b>R</b> para reiniciar.
    `;
    if (gameBoard) gameBoard.appendChild(box);
  }

  // ========================
  // PAUSE / RESUME
  // ========================
  let pauseOverlay = null;
  function createPauseOverlay() {
    if (pauseOverlay) return;
    pauseOverlay = document.createElement('div');
    pauseOverlay.className = 'pause-overlay';
    pauseOverlay.innerHTML = `<div class="pause-box"><h2>⏸️ PAUSADO</h2><p>Pressione P para continuar</p></div>`;
    if (gameBoard) gameBoard.appendChild(pauseOverlay);
  }
  function removePauseOverlay() {
    if (!pauseOverlay) return;
    pauseOverlay.remove();
    pauseOverlay = null;
  }
  function pauseGame() {
    paused = true;
    if (venom) venom.style.animationPlayState = 'paused';
    if (venom2) venom2.style.animationPlayState = 'paused';
    if (venomFly) venomFly.style.animationPlayState = 'paused';
    if (spider) spider.style.animationPlayState = 'paused';
    if (bgMusic && !bgMusic.paused) bgMusic.pause();
    createPauseOverlay();
  }
  function resumeGame() {
    paused = false;
    if (venom) venom.style.animationPlayState = 'running';
    if (venom2) venom2.style.animationPlayState = 'running';
    if (venomFly) venomFly.style.animationPlayState = 'running';
    if (spider) spider.style.animationPlayState = 'running';
    if (bgMusic && bgMusic.paused) bgMusic.play().catch(()=>{});
    removePauseOverlay();
  }

  // ========================
  // CONTROLES
  // ========================
  
  // Função de pulo
  function doJump() {
    if (!spider || gameOver || paused) return;
    
    spider.classList.remove('jump');
    spider.classList.remove('double-jump');
    void spider.offsetWidth;
    
    if (jumpCount < 2) {
      if (jumpCount === 0) {
        spider.classList.add('jump');
        setTimeout(() => { if (spider) spider.classList.remove('jump'); }, 700);
      } else {
        spider.classList.add('double-jump');
        setTimeout(() => { if (spider) spider.classList.remove('double-jump'); }, 900);
      }
      jumpCount++;
      setTimeout(() => jumpCount = 0, 1000);
    }
  }
  
  // Teclado
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !gameOver && !paused) {
      e.preventDefault();
      doJump();
    }

    if (e.code === 'KeyR') {
      const now = Date.now();
      if (now - lastRPress < 1000) {
        // Reset total
        highScore = 0;
        deathCount = 0;
        localStorage.setItem('highScore', 0);
        localStorage.setItem('localRanking', JSON.stringify([]));
        score = 0;
        updateScoreDisplay();
      } else if (gameOver) {
        startGame();
      }
      lastRPress = now;
    }

    if (e.code === 'KeyP' && !gameOver) {
      if (!paused) pauseGame(); else resumeGame();
    }
  });

  // ========================
  // BOTÕES DA INTRO
  // ========================
  if (helpBtn) helpBtn.addEventListener('click', () => window.location.href = 'instrucoes.html');
  
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      // Mostrar seletor de dificuldade
      if (difficultySelector) {
        difficultySelector.classList.remove('hidden');
      }
    });
  }

  // ========================
  // SELETOR DE DIFICULDADE
  // ========================
  if (difficultySelector) {
    difficultySelector.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        difficulty = this.dataset.diff;
        difficultySelector.classList.add('hidden');
        startGame();
        if (!bgMusic) playNextMusic();
      });
    });
  }

  // ========================
  // INICIALIZAÇÃO
  // ========================
  ensureVisible(venom);
  ensureHidden(venomFly);
  updateEnemySpeeds();
  updateScoreDisplay();

});
