/**
 * Pixel Arcade - Declarative Trophy Definitions
 * Trophies are pure JSON data compatible with browser and server evaluation.
 */
(function(root) {
  'use strict';

  const TROPHIES = [
    // ----------------------------------------------------
    // CHESS TROPHIES
    // ----------------------------------------------------
    {
      id: 'chess.first_win',
      game: 'chess',
      name: 'First Checkmate',
      desc: 'Win your first game of Pixel Chess.',
      tier: 'bronze',
      hidden: false,
      scope: 'local',
      xp: 10,
      on: 'gameover',
      when: { field: 'winner', eq: 'me' },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'chess.backrank',
      game: 'chess',
      name: 'Back Door',
      desc: 'Deliver checkmate with a back-rank mate.',
      tier: 'silver',
      hidden: false,
      scope: 'local',
      xp: 25,
      on: 'checkmate',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'pattern', eq: 'back-rank' }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'chess.small_fry',
      game: 'chess',
      name: 'Small Fry',
      desc: 'Deliver checkmate with a pawn.',
      tier: 'silver',
      hidden: false,
      scope: 'local',
      xp: 25,
      on: 'checkmate',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'byPiece', eq: 'p' }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'chess.clean_sheet',
      game: 'chess',
      name: 'Queen Unscathed',
      desc: 'Win a game without losing your Queen.',
      tier: 'silver',
      hidden: false,
      scope: 'local',
      xp: 25,
      on: 'gameover',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'lostQueen', eq: false }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'chess.underdog',
      game: 'chess',
      name: 'Underdog Promotion',
      desc: 'Promote a pawn to a Knight, Bishop, or Rook.',
      tier: 'bronze',
      hidden: false,
      scope: 'local',
      xp: 10,
      on: 'promotion',
      when: {
        all: [
          { field: 'by', eq: 'me' },
          { field: 'toPiece', in: ['n', 'b', 'r'] }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'chess.speedy',
      game: 'chess',
      name: 'Lightning Strike',
      desc: 'Win a game in 20 moves or fewer.',
      tier: 'gold',
      hidden: false,
      scope: 'local',
      xp: 50,
      on: 'gameover',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'moves', lte: 20 }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'chess.beat_dune',
      game: 'chess',
      name: 'Master of the Board',
      desc: 'Defeat Grandmaster Old Dune on the ladder.',
      tier: 'gold',
      hidden: true,
      scope: 'local',
      xp: 50,
      on: 'gameover',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'opponent', eq: 'dune' }
        ]
      },
      modes: ['cpu']
    },
    {
      id: 'chess.streak5',
      game: 'chess',
      name: 'Grandmaster Streak',
      desc: 'Achieve a winning streak of 5 in Pixel Chess.',
      tier: 'gold',
      hidden: false,
      scope: 'local',
      xp: 50,
      on: 'gameover',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'streak', gte: 5 }
        ]
      },
      modes: ['cpu', 'online-quick']
    },
    {
      id: 'chess.platinum',
      game: 'chess',
      name: 'Chess Grandmaster',
      desc: 'Unlock all standard trophies for Pixel Chess.',
      tier: 'platinum',
      hidden: false,
      scope: 'local',
      xp: 200,
      on: 'trophy_unlocked',
      when: { field: 'gameCompleted', eq: 'chess' },
      modes: ['all']
    },

    // ----------------------------------------------------
    // POOL TROPHIES
    // ----------------------------------------------------
    {
      id: 'pool.first_win',
      game: 'pool',
      name: 'Break the Ice',
      desc: 'Win your first game of Pixel Pool 3D.',
      tier: 'bronze',
      hidden: false,
      scope: 'local',
      xp: 10,
      on: 'gameover',
      when: { field: 'winner', eq: 'me' },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'pool.break_pot',
      game: 'pool',
      name: 'Opening Salvo',
      desc: 'Pocket a ball directly on the break shot.',
      tier: 'bronze',
      hidden: false,
      scope: 'local',
      xp: 10,
      on: 'shot_end',
      when: {
        all: [
          { field: 'by', eq: 'me' },
          { field: 'isBreak', eq: true },
          { field: 'pottedCount', gte: 1 }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'pool.table_wipe',
      game: 'pool',
      name: 'Table Wipe',
      desc: 'Pocket 3 or more balls in a single turn.',
      tier: 'silver',
      hidden: false,
      scope: 'local',
      xp: 25,
      on: 'shot_end',
      when: {
        all: [
          { field: 'by', eq: 'me' },
          { field: 'turnPotted', gte: 3 }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'pool.eight_hero',
      game: 'pool',
      name: 'Eight Ball Hero',
      desc: 'Legally pocket the 8-ball to claim victory.',
      tier: 'silver',
      hidden: false,
      scope: 'local',
      xp: 25,
      on: 'pot',
      when: {
        all: [
          { field: 'by', eq: 'me' },
          { field: 'ball', eq: 8 },
          { field: 'legal', eq: true }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'pool.no_foul',
      game: 'pool',
      name: 'Clean Cue',
      desc: 'Win a game without committing any fouls or scratches.',
      tier: 'gold',
      hidden: false,
      scope: 'local',
      xp: 50,
      on: 'gameover',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'fouls', eq: 0 }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'pool.streak5',
      game: 'pool',
      name: 'Pool Shark',
      desc: 'Achieve a winning streak of 5 in Pixel Pool.',
      tier: 'gold',
      hidden: false,
      scope: 'local',
      xp: 50,
      on: 'gameover',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'streak', gte: 5 }
        ]
      },
      modes: ['cpu', 'online-quick']
    },
    {
      id: 'pool.platinum',
      game: 'pool',
      name: 'Billiard Legend',
      desc: 'Unlock all standard trophies for Pixel Pool 3D.',
      tier: 'platinum',
      hidden: false,
      scope: 'local',
      xp: 200,
      on: 'trophy_unlocked',
      when: { field: 'gameCompleted', eq: 'pool' },
      modes: ['all']
    },

    // ----------------------------------------------------
    // CONNECT 4 TROPHIES
    // ----------------------------------------------------
    {
      id: 'connect4.first_win',
      game: 'connect4',
      name: 'Four Connected',
      desc: 'Win your first game of Connect 4.',
      tier: 'bronze',
      hidden: false,
      scope: 'local',
      xp: 10,
      on: 'gameover',
      when: { field: 'winner', eq: 'me' },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'connect4.diagonal',
      game: 'connect4',
      name: 'Diagonal Threat',
      desc: 'Win a game with a diagonal connection of four discs.',
      tier: 'silver',
      hidden: false,
      scope: 'local',
      xp: 25,
      on: 'gameover',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'direction', eq: 'diagonal' }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'connect4.speed',
      game: 'connect4',
      name: 'Rapid Connection',
      desc: 'Win a game in 8 turns or fewer.',
      tier: 'gold',
      hidden: false,
      scope: 'local',
      xp: 50,
      on: 'gameover',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'turns', lte: 8 }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'connect4.platinum',
      game: 'connect4',
      name: 'Grid Dominator',
      desc: 'Unlock all standard trophies for Connect 4.',
      tier: 'platinum',
      hidden: false,
      scope: 'local',
      xp: 200,
      on: 'trophy_unlocked',
      when: { field: 'gameCompleted', eq: 'connect4' },
      modes: ['all']
    },

    // ----------------------------------------------------
    // AYO TROPHIES
    // ----------------------------------------------------
    {
      id: 'ayo.first_win',
      game: 'ayo',
      name: 'First Harvest',
      desc: 'Win your first match of Ayo.',
      tier: 'bronze',
      hidden: false,
      scope: 'local',
      xp: 10,
      on: 'gameover',
      when: { field: 'winner', eq: 'me' },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'ayo.big_pit',
      game: 'ayo',
      name: 'Bountiful Pit',
      desc: 'Capture a pit holding 4 or more seeds.',
      tier: 'silver',
      hidden: false,
      scope: 'local',
      xp: 25,
      on: 'capture',
      when: {
        all: [
          { field: 'by', eq: 'me' },
          { field: 'count', gte: 4 }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'ayo.landslide',
      game: 'ayo',
      name: 'Landslide Sower',
      desc: 'Win a game with 32 or more captured seeds.',
      tier: 'gold',
      hidden: false,
      scope: 'local',
      xp: 50,
      on: 'gameover',
      when: {
        all: [
          { field: 'winner', eq: 'me' },
          { field: 'seeds', gte: 32 }
        ]
      },
      modes: ['cpu', '2p', 'online-quick', 'online-room']
    },
    {
      id: 'ayo.platinum',
      game: 'ayo',
      name: 'Grand Sower',
      desc: 'Unlock all standard trophies for Ayo.',
      tier: 'platinum',
      hidden: false,
      scope: 'local',
      xp: 200,
      on: 'trophy_unlocked',
      when: { field: 'gameCompleted', eq: 'ayo' },
      modes: ['all']
    },

    // ----------------------------------------------------
    // SCRABBLE TROPHIES
    // ----------------------------------------------------
    {
      id: 'scrabble.first_word',
      game: 'scrabble',
      name: 'First Word',
      desc: 'Complete your first game of Pixel Scrabble.',
      tier: 'bronze',
      hidden: false,
      scope: 'local',
      xp: 10,
      on: 'gameover',
      when: { field: 'completed', eq: true },
      modes: ['2p', 'online-quick', 'online-room']
    },
    {
      id: 'scrabble.bingo',
      game: 'scrabble',
      name: 'Bingo!',
      desc: 'Play all 7 rack tiles in a single turn for the 50-point bonus.',
      tier: 'gold',
      hidden: false,
      scope: 'local',
      xp: 50,
      on: 'play',
      when: {
        all: [
          { field: 'by', eq: 'me' },
          { field: 'bingo', eq: true }
        ]
      },
      modes: ['2p', 'online-quick', 'online-room']
    },
    {
      id: 'scrabble.century',
      game: 'scrabble',
      name: 'Century Score',
      desc: 'Finish a match with 100 or more points.',
      tier: 'silver',
      hidden: false,
      scope: 'local',
      xp: 25,
      on: 'gameover',
      when: {
        all: [
          { field: 'myScore', gte: 100 }
        ]
      },
      modes: ['2p', 'online-quick', 'online-room']
    },
    {
      id: 'scrabble.platinum',
      game: 'scrabble',
      name: 'Lexicon Master',
      desc: 'Unlock all standard trophies for Pixel Scrabble.',
      tier: 'platinum',
      hidden: false,
      scope: 'local',
      xp: 200,
      on: 'trophy_unlocked',
      when: { field: 'gameCompleted', eq: 'scrabble' },
      modes: ['all']
    },

    // ----------------------------------------------------
    // ARCADE-WIDE TROPHIES
    // ----------------------------------------------------
    {
      id: 'arcade.first_steps',
      game: 'arcade',
      name: 'Insert Coin',
      desc: 'Unlock your first trophy in any Pixel Arcade game.',
      tier: 'bronze',
      hidden: false,
      scope: 'local',
      xp: 10,
      on: 'trophy_unlocked',
      when: { field: 'totalUnlocked', gte: 1 },
      modes: ['all']
    },
    {
      id: 'arcade.collector_5',
      game: 'arcade',
      name: 'Silver Shelf',
      desc: 'Unlock at least 5 trophies across Pixel Arcade.',
      tier: 'silver',
      hidden: false,
      scope: 'local',
      xp: 25,
      on: 'trophy_unlocked',
      when: { field: 'totalUnlocked', gte: 5 },
      modes: ['all']
    },
    {
      id: 'arcade.collector_12',
      game: 'arcade',
      name: 'Trophy Hunter',
      desc: 'Unlock at least 12 trophies across Pixel Arcade.',
      tier: 'gold',
      hidden: false,
      scope: 'local',
      xp: 50,
      on: 'trophy_unlocked',
      when: { field: 'totalUnlocked', gte: 12 },
      modes: ['all']
    }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TROPHIES;
  } else {
    root.ArcadeTrophiesData = TROPHIES;
  }
})(typeof window !== 'undefined' ? window : globalThis);
