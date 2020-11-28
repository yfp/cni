function decrypt(message, key) {
  arr = Uint8Array.from(atob(message), c => c.charCodeAt(0))

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
        path: params.key + '/' + room + '/' + room
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
  }
}

const Server = {
  template: '<game-field ref="game"></game-field>',
  mounted: function() {
    console.log("server");
    this.deal = this.$refs.game.generateDeal(this.$route.params.seed);
    this.$refs.game.deal(this.deal);
    new Math.seedrandom();
    G.ably = new Ably.Realtime({
      key: G.apikey,
      clientId: 'Server'+Math.round(1000000*Math.random())
    });
    G.channel = G.ably.channels.get('ch-'+this.$route.params.room);
    G.channel.presence.subscribe('enter', this.newPlayer);
    G.channel.presence.subscribe('leave', function(member) {
      console.log('Member ' + member.clientId + ' left');
    });
    this.real_colors = this.generateColors();
    console.log(this.real_colors)
    this.updateClients();
  },
  methods: {
    newPlayer: function(member) {
      console.log('Member ' + member.clientId + ' entered');
      console.log(member);
      this.updateClients();
    },
    updateClients: function() {
      G.channel.publish('update', {
        deal: this.deal,
        known_colors: this.real_colors
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
    }
  },
  data: function(){
    return {
      deal: [],
      known_colors: [],
      real_colors: [],
      players: {}
    }
  }
}

const Client = {
  template: '#client-name-screen',
  mounted: function() {
    if(this.input != '') this.enterPlayerName(new Event('event'));
  },
  methods: {
    enterPlayerName: function(e) {
      this.player = this.input;
      console.log("player "+this.player)
      e.preventDefault();
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
        console.log(message.data);
        $this.$refs.game.deal(message.data.deal);
        $this.$refs.game.updateColors(message.data.known_colors);
      });
      G.channel.presence.enter();
    }
  },
  data: function() {
    return {
      input: 'ivan',
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
      cards: Array(CARDS_NUMBER).join().split(','),
      items: [],
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
        else if(i<=5)   this.items.push({cl: "letter", index: ''+i});
        else if(i%6==0) this.items.push({cl: "letter", index: letter[i/6 - 1]});
        else {
          this.items.push({
            cl: "image",
            color: "unknown",
            url: ""
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
      return seed.split(',').reduce(get_cards, []);
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

    }
  }
});

const router = new VueRouter({
  routes: [{
    path: '/:key',
    component: StartScreen
  }, {
    path: '/:key/:room/:seed',
    component: Server
  }, {
    path: '/:key/:room',
    component: Client
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