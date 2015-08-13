var self = require('sdk/self');
var prefs = require('sdk/preferences/service');
let { Cc, Ci, Cu } = require('chrome');

var { ToggleButton } = require('sdk/ui/button/toggle');
var panels = require('sdk/panel');

var button = ToggleButton({
  id: 'verhueterli',
  label: 'verhueterli',
  icon: {
    '16': './icon_16.png',
    '32': './icon_32.png',
    '64': './icon_64.png',
    '128': './icon_128.png'
  },
  onChange: handleChange
});

var panel = panels.Panel({
  contentURL: './panel.html',
  contentScriptFile: './panel.js',
  onHide: handleHide
});

function handleChange(state) {
  if (state.checked) {
    panel.show({
      position: button
    });
  }
}

function handleHide() {
  button.state('window', {checked: false});
}

panel.port.on('check-webrtc', function(value) {
    console.log('check-webrtc', value);
    prefs.set('media.peerconnection.enabled', value);
});
panel.port.emit('check-webrtc', prefs.get('media.peerconnection.enabled'));

panel.port.on('check-iceservers', function (settings) {
    prefs.set('media.peerconnection.use_document_iceservers', !settings.forceIce);
    if (settings.forceIce) {
        prefs.set('media.peerconnection.default_iceservers', JSON.stringify([{
            urls: settings.urls,
            username: settings.username,
            credential: settings.credential
        }]));
    } // else leave it alone?

});

// http://mxr.mozilla.org/mozilla-central/source/browser/modules/webrtcUI.jsm?mark=132-155#129
// biggest issue: how to import this...
let {webrtcUI} = Cu.import('resource:///modules/webrtcUI.jsm', {});
console.log('imported', webrtcUI);
var origReceiveMessage = webrtcUI.receiveMessage;
console.log('receiveMessage', origReceiveMessage);
var windows = {};
webrtcUI.receiveMessage = function(msg) {
    console.log('webrtc receiveMessage', msg.name);
    switch(msg.name) {
    case 'rtcpeer:Request': 
        var request = msg.data;
        console.log('callID', request.callID, 'windowID', request.windowID);
        console.log('request', request);
        /*
         * console.log: webrtc-verhueterli: request {"windowID":8,"innerWindowID":12,"callID":"1","documentURI":"about:blank","secure":false}
         */
        // gives me no information about the peerconnection, its stun/turn servers etc
        // also is called between createOffer and callback which is before ice gathering
        // (the dangerous part) starts

        // I assume that windowID can stay the same while documentURI can change
        // FIXME: when can we clean up windows[uri]?
        if (!windows[request.documentURI]) {
            windows[request.documentURI] = {
                hasPermission: false,
                pending: []
            }
            // add a checkbox
            panel.port.emit(msg.name, {
                uri: request.documentURI
            });
        }
        if (windows[request.documentURI].hasPermission) {
            // permission already granted
            msg.target.messageManager.sendAsyncMessage('rtcpeer:Allow', { callID: request.callID, windowID: request.windowID });
        } else {
            panel.show({
              position: button
            });
            windows[request.documentURI].pending.push({
                callID: request.callID,
                windowID: request.windowID,
                messageManager: msg.target.messageManager
            });
        }
        break;
    case 'rtcpeer:CancelRequest':
        // not clear when that happens, probably needs to clean up
        break;
    default:
        return origReceiveMessage.call(this, msg);
    }
};
panel.port.on('rtcpeer:Allow', function (response) {
    console.log('allow', response.uri);
    var win = windows[response.uri];
    console.log(win, windows);
    if (win) {
        win.hasPermission = true;
        var pending = win.pending;
        win.pending.forEach(function (request) {
            console.log('pending', request);
            request.messageManager.sendAsyncMessage('rtcpeer:Allow', {
                callID: request.callID,
                windowID: request.windowID
            });
        });
        win.pending = [];
    }
});

// TODO: deny with :Deny (via jib)


exports.verhueterli = button;