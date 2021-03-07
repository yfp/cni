function decrypt(message, key) {
  arr = Uint8Array.from(atob(message), c => c.charCodeAt(0));

  out = new Uint8Array(arr.length);
  for (var i = 0; i < arr.length; i += 1) {
    out[i] = arr[i] ^ key[i % key.length];
  }
  return btoa(String.fromCharCode.apply(null, out));
}


CARDS_NUMBER = 280;
CARDS_ON_THE_TABLE = 20;

const G = {
  channel: null
}

const StartScreen = {
  template: '#start-screen',
  mounted: function() {
    console.log("start key " + this.$route.params.key)
  },
  methods: {
    createRoom: function() {
      room = this.genRoomCode();
      console.log("Room create " + room);
      params = this.$route.params;
      router.push({
        path: params.key +'/' + 's/' + room + '/' + room
      })
    },
    connectClient: function() {
      room = this.roomInput.toUpperCase();
      console.log("Connect to room " + room);
      params = this.$route.params;
      router.push({
        path: params.key +'/' + 'c/' + room + '/start'
      })
    },
    genRoomCode: function genCode() {
      letters = "ABCDEFGHJKLMNPQRSTUWXYZ";
      digits = "23456789";
      all = letters + digits;
      var prng = new Math.seedrandom();
      rnd = (arr) => arr[Math.floor(prng() * arr.length)]
      return rnd(letters) + rnd(all) + rnd(all) + rnd(all);
    }
  },
  data: function(){
    return {
      roomInput: ''
    };
  }
}

const Server = {
  template: '<game-field ref="game" v-on:update="updateClients" v-on:serverclick="serverClick" v-on:updateleaders="updateLeaders" v-on:newround="newRound"></game-field>',
  mounted: function() {
    console.log("server");
    this.$refs.game.role = 'server';
    new Math.seedrandom();
    G.ably = new Ably.Realtime({
      key: G.apikey,
      clientId: 'Server'+Math.round(1000000*Math.random())
    });
    G.channel = G.ably.channels.get('ch-'+this.$route.params.room);
    G.channel.presence.subscribe('enter', this.newPlayer);
    G.channel.presence.subscribe('update', this.newPlayer);
    G.channel.presence.subscribe('leave', this.playerLeft);
    G.channel.publish('new-server', {});
    this.newRound();
  },
  methods: {
    newRound: function() {
      this.$refs.game.pregame = true;

      this.deal = this.$refs.game.generateDeal(this.$route.params.seed);
      console.log(this.deal);
      this.$refs.game.deal(this.deal);
      this.real_colors = this.generateColors();
      this.$refs.game.known_colors = this.real_colors.map(i => 0);
      this.$refs.game.updateColors(this.$refs.game.known_colors);
      this.$refs.game.startingTeam = this.findStartingTeam();
      this.$refs.game.splitTeams();
      this.updateClients();
    },
    newPlayer: function(member) {
      console.log('Member ' + member.clientId + ' entered');
      name = member.clientId;
      if(!(name in this.$refs.game.players) && this.$refs.game.pregame) {
        this.$refs.game.players[name] = {name: name.charAt(0).toUpperCase() + name.slice(1), led: 0};
        this.$refs.game.splitTeams();
        // this.$refs.game.teams
      }
      this.updateClients();
      if(!this.$refs.game.pregame) this.updateLeaders();
    },
    playerLeft: function(member) {
      console.log('Member ' + member.clientId + ' left');
      // name = member.clientId;
      // delete this.$refs.game.players[name];
      // this.updateClients();
    },
    updateClients: function() {
      G.channel.publish('update', {
        deal: this.deal,
        known_colors: this.$refs.game.known_colors,
        teams: this.$refs.game.teams,
        players: this.$refs.game.players,
        pregame: this.$refs.game.pregame,
      });
    },
    generateColors: function() {
      let s = "1111111222222233334"
      let prng = new Math.seedrandom(this.$route.params.room + this.$route.params.seed);
      s += prng() > 0.5 ? "1" : "2";
      shuffle = function (a) {
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }
      return shuffle(Array.from(s)).map(e => parseInt(e));
    },
    findStartingTeam: function() {
      val = this.real_colors.map(i => i==1? 1 : i==2? -1 : 0).reduce((a, b) => a + b, 0);
      if(val == 1) return "red";
      return "blue";
    },
    serverClick: function(index) {
      this.$refs.game.known_colors[index] = this.real_colors[index];
      this.$refs.game.updateColors(this.$refs.game.known_colors);
      this.updateClients();
    },
    updateLeaders: function() {
      G.channel.publish('leaderInfo', {
        real_colors: this.real_colors
      });
    }
  },
  data: function(){
    return {
      deal: [],
      real_colors: [],
      players: {},
    }
  }
}

const Client = {
  template: '#client-name-screen',
  mounted: function() {
    params = this.$route.params;
    console.log(params.playername);
    if(params.playername == 'start')
      return;
    this.player = atob(params.playername);
    this.connect();
  },
  methods: {
    enterPlayerName: function(e) {
      e.preventDefault();
      params = this.$route.params;
      cryptedName = btoa(this.input);
      console.log(this.input, " >>  ", cryptedName);
      this.player = this.input
      router.push({
        path: "/" + params.key +'/' + 'c/' + params.room + '/' + cryptedName
      });
      this.connect();
    },
    connect: function() {
      G.ably = new Ably.Realtime({
        key: G.apikey,
        clientId: this.player
      });
      G.channel = G.ably.channels.get('ch-'+this.$route.params.room);
      $this = this;
      G.channel.subscribe('update', function(message) {
        $this.$refs.game.you = $this.player;
        $this.$refs.game.deal(message.data.deal);
        $this.$refs.game.teams = message.data.teams;
        $this.$refs.game.players = message.data.players;
        $this.$refs.game.pregame =  message.data.pregame;
        teams = message.data.teams;
        role = 'player';
        if(teams){
          if(teams[0].players.length>0) if(teams[0].players[0] == $this.player)
            role = 'leader';
          if(teams[1].players.length>0) if(teams[1].players[0] == $this.player)
            role = 'leader'
          $this.$refs.game.role = role;
          if(teams[0].players.includes($this.player))
            $this.$refs.game.teamColor = teams[0].color;
          if(teams[1].players.includes($this.player))
            $this.$refs.game.teamColor = teams[1].color;
        }
        if(message.data.pregame || $this.$refs.game.role == 'player')
          $this.$refs.game.updateColors(message.data.known_colors);
      });
      G.channel.subscribe('leaderInfo', function(message) {
        if($this.$refs.game.role != 'leader') return;
        $this.$refs.game.updateColors(message.data.real_colors);
      });
      G.channel.subscribe('new-server', function() {
        console.log('New server');
        G.channel.presence.update();
      });
      G.channel.presence.enter();
    }
  },
  data: function() {
    return {
      input: '',
      player: false
    };
  }
}

const GameComponent = Vue.component('game-field',{
  template: '#game',
  mounted: function() {
    this.decode();
  },
  data: function(){
    return {
      role: 'player',
      teamColor: '',
      cards: Array(CARDS_NUMBER).join().split(','),
      items: [],
      you: '',
      players: {},
      teams: [{color: "red",players: []},{color: "blue",players: []}],
      startingTeam: 'blue',
      wordZone: '',
      pregame: true,
    }
  },
  methods: {
    decode: function(){
      key = Uint8Array.from(this.$route.params.key, c => c.charCodeAt(0))
      i=0;
      for(s of data){
          this.cards[i] = "url(" + 'data:image/jpeg;base64,'+decrypt(pdata+s, key) +")";
          i+=1;
      }
      letter = 'ABCD';
      j=0;
      for(i=0; i<30; i++){
        if(i==0)        this.items.push({cl: "blank"});
        else if(i<=5)   this.items.push({cl: "letter", letter: ''+i});
        else if(i%6==0) this.items.push({cl: "letter", letter: letter[i/6 - 1]});
        else {
          this.items.push({
            cl: "image",
            color: "unknown",
            url: "",
            index: j
          });
          j+=1;
        }
      }
    },
    generateDeal: function(seed) {
      get_cards = function (cards, seed){
          let L = cards.length;
          let prng = new Math.seedrandom(seed + L);
          if(L + CARDS_ON_THE_TABLE >= CARDS_NUMBER){
              return cards;
          }
          while(cards.length < L + CARDS_ON_THE_TABLE){
              card = Math.floor(CARDS_NUMBER * prng());
              if(!cards.includes(card)){
                  cards.push(card)
              }
          }
          return cards;
      }
      cards = seed.split(',').reduce(get_cards, []);
      console.log(cards);
      return cards.slice(cards.length-20);
    },
    deal: function(deal) {
      j=0;
      for(i=7; i<30; i++)
        if(i%6!=0) {
          this.items[i].url = this.cards[deal[j]];
          j+=1;
        }
    },
    updateColors: function(colors) {
      j=0;
      for(i=7; i<30; i++)
        if(i%6!=0) {
          const c = colors[j];
          let col = "unknown";
          if(c == 1) col = "red";
          if(c == 2) col = "blue";
          if(c == 3) col = "yellow";
          if(c == 4) col = "black";
          this.items[i].color = col;
          j+=1;
        }
    },
    splitTeams: function() {
      this.teams[0].color = this.startingTeam;
      this.teams[1].color = this.startingTeam == "red" ? "blue" : "red";
      this.teams[0].players = [];
      this.teams[1].players = [];
      ids = Object.keys(this.players);
      if(ids.length == 0) return
      if(ids.length == 1) {
        this.teams[0].players.push(ids[0]);
        return;
      }
      minled = Math.min.apply(Math, ids.map((i) => this.players[i].led));
      leader_shortlist = []
      while(leader_shortlist.length < 2) {
        leader_shortlist = leader_shortlist.concat(
          ids.filter(i => this.players[i].led == minled));
        minled += 1;
      }
      leaders = [];
      while(leaders.length < 2){
        i = Math.floor(leader_shortlist.length * Math.random());
        leaders.push(leader_shortlist[i]);
        ids.splice(ids.indexOf(leader_shortlist[i]),1);
        leader_shortlist.splice(i, 1);
      }
      this.teams[0].players.push(leaders[0]);
      this.teams[1].players.push(leaders[1]);
      j=0;
      while(ids.length>0){
        i = Math.floor(ids.length * Math.random());
        this.teams[j%2].players.push(ids[i]);
        ids.splice(i,1);
        j+=1;
      }
      this.$emit('update');
    },
    makeLeader: function(event, playerName) {
      if( this.teams[0].players.indexOf(playerName) >= 0 ) {
        team = this.teams[0].players;
      } else {
        team = this.teams[1].players;
      }
      index = team.indexOf(playerName);
      team.splice(index, 1);
      team.unshift(playerName);
      this.$emit('update');
    },
    switchTeam: function(event, playerName) {
      if( this.teams[0].players.indexOf(playerName) >= 0 ) {
        teamFrom = this.teams[0].players;
        teamTo = this.teams[1].players;
      } else {
        teamFrom = this.teams[1].players;
        teamTo = this.teams[0].players;
      }
      if(teamFrom.length <= 1)
        return;
      index = teamFrom.indexOf(playerName);
      teamFrom.splice(index, 1);
      teamTo.push(playerName);
      this.$emit('update');
    },
    serverClick: function(index, event){
      this.$emit('serverclick', index);
    },
    startRound: function() {
      if(this.teams[0].players.length + this.teams[1].players.length < 2) return;
      this.pregame = false;
      this.$emit('updateleaders');
    },
    newRound: function() {
      for(i in [0,1])
        if(this.teams[i].players.length>0)
          if(this.teams[i].players[0] in this.players)
            this.players[this.teams[i].players[0]].led += 1;
      console.log(this.players);
      params = this.$route.params;
      params.seed = params.seed + ',' + 'x';
      router.push({
        path: '/' + params.key + '/s/' + params.room + '/' + params.seed
      })
      this.$emit('newround');
    },
  }
});

const router = new VueRouter({
  routes: [{
    path: '/:key',
    component: StartScreen
  }, {
    path: '/:key/c/:room/:playername',
    component: Client
  },
  {
    path: '/:key/s/:room/:seed',
    component: Server
  }]
})

var app = new Vue({
  el: '#app',
  router: router,
  beforeCreate: function() {
    G.apikey = atob(decrypt('STtCdkFBJ0R0TTd0dzpJU0h2WllsX183UXJXMVpW', this.$route.params.key));
  },
  methods: {}
})