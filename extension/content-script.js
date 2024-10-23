import browser from 'webextension-polyfill'
import { bech32 } from '@scure/base'
import { verifyEvent } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'

// inject the script that will provide window.nostr
let script = document.createElement('script')
script.setAttribute('async', 'false')
script.setAttribute('type', 'text/javascript')
script.setAttribute('src', browser.runtime.getURL('nostr-provider.js'))
document.head.appendChild(script)

// listen for messages from that script
window.addEventListener('message', async message => {
  if (message.source !== window) return
  if (!message.data) return
  if (!message.data.params) return
  if (message.data.ext !== 'nos2x') return

  // pass on to background
  var response
  try {
    response = await browser.runtime.sendMessage({
      type: message.data.type,
      params: message.data.params,
      host: location.host
    })
  } catch (error) {
    response = {error}
  }

  // return response
  window.postMessage(
    {id: message.data.id, ext: 'nos2x', response},
    message.origin
  )
})

function decompress(byteArray) {
  const cs = new DecompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(byteArray);
  writer.close();
  return new Response(cs.readable).arrayBuffer().then(function (arrayBuffer) {
    return new TextDecoder().decode(arrayBuffer);
  });
}

function decodeNEmbed(nip19) {
  console.log("Decoding", nip19)
  let { prefix, words } = bech32.decode(nip19, 5000)
  let data = new Uint8Array(bech32.fromWords(words))

  if (prefix == "nembed") {
    return decompress(data)
  }

  throw new Error('Not an embed');
}

function replaceNode(node, match) {
  try {
    decodeNEmbed(match.split('nostr:')[1]).then(function (json) {
      let event = JSON.parse(json)
      let npub = nip19.npubEncode(event.pubkey)
      let isGood = verifyEvent(event)
  
      if (isGood) {
        const parent = node.parentNode;

        if (parent) {
          console.log("Hi here!")
          const span = document.createElement('span');
          span.innerHTML = event.content + "<BR>Signed by: <a href='http://njump.me/"+npub+"'>" + npub + "</a>";
          parent.insertBefore(span, node);
      
          parent.removeChild(node);
        } 
      }
    });
  } catch (e) {

  }
}


// Function to add text after each nostr: URI
function parseNostrEmbeds() {
  // Find all text nodes in the document
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;

  // Iterate through each text node
  while (node = walker.nextNode()) {
    const nostrUriRegex = /nostr:nembed1[a-z\d]+/g;
    const matches = node.nodeValue.match(nostrUriRegex);

    if (matches) {
      matches.forEach((match) => {
        replaceNode(node, match) 
      });
    }
  }
}

function observeDOMChanges() {
  // Options for the observer (which mutations to observe)
  const config = { childList: true, subtree: true };

  // Create an observer instance linked to the callback function
  const observer = new MutationObserver((mutationsList) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        // Run the nostr URI text adder when changes occur
        parseNostrEmbeds();
      }
    }
  });

  // Start observing the document body for changes
  observer.observe(document.body, config);
}

parseNostrEmbeds()
observeDOMChanges()