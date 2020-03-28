function getParameterByName(name) {
    url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return '';
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}
key = getParameterByName('key');
if(key.length==0)
    key='default_key';
key = Uint8Array.from(key, c => c.charCodeAt(0))

function decrypt(message, key){
    arr = Uint8Array.from(atob(message), c => c.charCodeAt(0))

    out = new Uint8Array(arr.length);
    for(var i=0; i<arr.length; i+=1){
        out[i] = arr[i] ^ key[i % key.length];
    }
    return btoa(String.fromCharCode.apply(null, out));
}

images = []
for(s of data){
    images.push( decrypt(pdata+s, key) )
}



seed = getParameterByName('seed');


if(seed == ''){
    let prng = new Math.seedrandom();
    seed = '' + prng();
}

CARDS_NUMBER = 280;
CARDS_ON_THE_TABLE = 20;

function get_cards(cards, seed){
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


$('.image').each(function(i){
    let j = cards[cards.length-CARDS_ON_THE_TABLE+i];
    let str = "data:image/jpeg;base64, " + images[j];
    $(this).css('background-image', `url("${str}")`).addClass('simple');
});

$('.image').click(function(){
    if($(this).hasClass('simple')){
        $(this).removeClass('simple').addClass('red');
    }else if($(this).hasClass('red')){
        $(this).removeClass('red').addClass('blue');
    }else if($(this).hasClass('blue')){
        $(this).removeClass('blue').addClass('yellow');
    }else if($(this).hasClass('yellow')){
        $(this).removeClass('yellow').addClass('simple');
    }
});