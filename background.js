registerExternalMessageListener();

// listen for messages from the content script
function registerExternalMessageListener() {
  chrome.runtime.onMessageExternal.addListener(
    function(request, sender, sendResponse) {
      if(request.getPersistedMessages) {
        getPersistedMessages(messages => {
          sendResponse(messages);
        });
      }
      if(request.receivedMessages) {
        setReceivedMessages(request.receivedMessages);
      }
      if(request.removedMessages) {
        setRemovedMessages(request.removedMessages);
      }
      if(request.lastPurgeTime) {
        setLastPurgeTime(request.lastPurgeTime);
      }
      return true; // return true to use sendResponse asynchronously
    }
  );
}

// returns the messages which we have persisted in local storage
function getPersistedMessages(callback) {
  chrome.storage.local.get(['receivedMessages', 'removedMessages', 'lastPurgeTime'], function(result) {
    callback(result);
  });
}

// persists the messages which we have received (new messages)
function setReceivedMessages(messages) {
  chrome.storage.local.set({'receivedMessages': messages});
}

// persists the messages which have been removed (deleted messages)
function setRemovedMessages(messages) {
  chrome.storage.local.set({'removedMessages': messages});
}

// persists the timestamp of the last time receivedMessages were purged
function setLastPurgeTime(timestamp) {
  chrome.storage.local.set({'lastPurgeTime': timestamp});
}