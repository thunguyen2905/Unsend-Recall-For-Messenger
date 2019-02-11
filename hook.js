import {
  getPersistedMessages,
  getReducedMessageObject,
  _getViewerAuthorFbt,
  _getOtherAuthorFbt,
  _getUnknownAuthorFbt,
  setReceivedMessages,
  setRemovedMessages,
  setLastPurgeTime
} from './util.js';

// list of modules to hook into using the window.requireLazy method
const HOOK_MODULES = [
  'RemovedMessageTombstoneContent',
  'MessengerState.bs',
  'MessengerParticipants.bs',
  'MercuryThreadInformer',
  'MercuryIDs',
  'CurrentUser'
];
const NEW_MESSAGE_EVENT = 'new-message';
const REMOVED_MESSAGE_UNSENDABILITY_STATUS = 'deny_tombstone_message';

// map of message ids to new messages which we have intercepted
let receivedMessages = {};
// map of message ids to messages which have been removed
let removedMessages = {};
// map of module names to modules we have required using the window.requireLazy method
let Modules = {};

hookMessengerModules(() => {
  loadPersistedMessages();
});

// hooks into the modules that are used by Messenger to display removed messages
function hookMessengerModules(callback) {
  if(window.requireLazy) {
    window.requireLazy(HOOK_MODULES, (...modules) => {
      setHookedModules(...modules);
      
      // override and hook into methods relating to messages
      Modules.RemovedMessageTombstoneContent.getTombstoneContent = getTombstoneContent;
      Modules.MercuryThreadInformer.prototype.informNewMessage = informNewMessage;
      Modules.MercuryThreadInformer.prototype.updatedMessage = updatedMessage;
      
      callback();
    });
  } else {
    console.warn('Failed to inject Unsend Recall for Messenger hook.');
  }
}

// sends a message to the background script to return messages persisted in local storage
function loadPersistedMessages() {
  getPersistedMessages((response) => {
    if(response.receivedMessages) {
      receivedMessages = JSON.parse(response.receivedMessages);
    }
    if(response.removedMessages) {
      removedMessages = JSON.parse(response.removedMessages);
    }
    // purge receivedMessages if the time conditions are met
    purgeReceivedMessages(response.lastPurgeTime);
  });
}

// override the method used to render the content inside a removed message
function getTombstoneContent(message, metadata) {
  let messageAuthor = message.author;
  let messageAuthorId = Modules.MercuryIDs.getUserIDFromParticipantID(messageAuthor);
  let currentUserId = Modules.CurrentUser.getID();
  let removedMessage = getRemovedMessage(message);
  
  // the message is sent by the current user (yourself)
  if (messageAuthorId === currentUserId) {
    return _getViewerAuthorFbt(removedMessage);
  }
  
  let threadMeta = Modules.MessengerState.getThreadMetaNow(currentUserId, message.thread_id);
  let messageAuthorName = threadMeta.custom_nickname ? threadMeta.custom_nickname[messageAuthorId] : Modules.MessengerParticipants.getNow(messageAuthor).short_name;
  
  if (threadMeta) {
    return _getOtherAuthorFbt(messageAuthorName, removedMessage);
  } else {
    return _getUnknownAuthorFbt(removedMessage);
  }
}

// override the method which informs of new messages
function informNewMessage(threadId, message) {
  let messageId = message.message_id;
  
  // save a reduced form of the message object to local storage
  receivedMessages[messageId] = getReducedMessageObject(message);
  setReceivedMessages(receivedMessages);
  
  // call internal inform method so the UI will update with the new message
  this.inform(NEW_MESSAGE_EVENT, {
    threadID: threadId,
    message: message
  });
}

// override the method which informs of updated messages
function updatedMessage(threadId, messageId, source) {
  // call internal method so the UI will update accordingly
  this.$MercuryThreadInformer11[threadId] || (this.$MercuryThreadInformer11[threadId] = {}),
  this.$MercuryThreadInformer11[threadId][messageId] = {
    source
  }
  this.updatedThread(threadId);
  
  // check if the updated message was removed
  checkForRemovedMessage(messageId);
}

// checks if the message was removed and handles persisting it
function checkForRemovedMessage(messageId) {
  let currentUserId = Modules.CurrentUser.getID();
  let messages = Modules.MessengerState.getMessagesFromIDs(currentUserId, [messageId]);
  if(messages && messages[0]) {
    let updatedMessage = messages[0];
    // the message was removed, so delete it from receivedMessages and add it to removedMessages
    if(updatedMessage.message_unsendability_status === REMOVED_MESSAGE_UNSENDABILITY_STATUS) {
      addRemovedMessage(messageId);
    }
  }
}

// returns the removed message from local storage if it exists
function getRemovedMessage(message) {
  let messageId = message.message_id;
  // if the removed message exists in receivedMessages, transfer it to removedMessages
  if(receivedMessages[messageId]) {
    addRemovedMessage(messageId);
  }
  // if the removed message exists in local storage, return it
  if(removedMessages[messageId]) {
    let message = removedMessages[messageId];
    let messageBody = message.body;
    if(message.has_attachment) { // the message has a link
      let attachment = message.attachments[0];
      let link = attachment.url ? attachment.url : attachment.share.uri;
      // if the message has a body, return the body and the link, else just the link itself
      return message.body.length > 0 ? `${messageBody} ${link}` : link;
    }
    return messageBody;
  }
  return null; // the message doesn't exist in local storage
}

// adds the message to removedMessages and deletes it from receivedMessages
function addRemovedMessage(messageId) {
  removedMessages[messageId] = receivedMessages[messageId];
  delete receivedMessages[messageId];
  setRemovedMessages(removedMessages);
  setReceivedMessages(receivedMessages);
}

// TODO: write a better purging strategy
/**
* This function purges the receivedMessages object because it can get rather
* large fast since every new Facebook message is pushed to it. Right now the
* purging strategy is to purge every 24 hours, and during the purge, only remove
* messages whose timestamps are older than 10 minutes. We don't want to purge every
* time the user opens up Facebook/Messenger because we might be removing received messages
* before we had a chance to mark them as removed, so the message will become lost and we
* can no longer show the removed message. Purging after 24 hours gives the user a chance to
* check on new messages that will be transfered to removedMessages in local storage
* which will never be purged. We also check if the message is older than 10 minutes because
* there might be some newly received messages which have been removed before the 10 minute
* grace period Facebook gives users to remove messages.
*/
function purgeReceivedMessages(lastPurgeTime) {
  if(!lastPurgeTime) {
    setLastPurgeTime();
    return;
  }
  
  const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
  const TEN_MINUTES = 10 * 60 * 1000;
  let currentTimestamp = new Date().getTime();
  let oneDayFromLastPurgeTime = lastPurgeTime + ONE_DAY;
  
  // if the last purge happned more than a day ago, purge again
  if(currentTimestamp > oneDayFromLastPurgeTime) {
    Object.keys(receivedMessages).forEach(function(key) {
      let message = receivedMessages[key];
      let tenMinutesFromMessageTimestamp = message.timestamp + TEN_MINUTES;
      // only delete messages which are older than 10 minutes
      if(currentTimestamp > tenMinutesFromMessageTimestamp) {
        delete receivedMessages[key];
      }
    });
    setReceivedMessages(receivedMessages);
    setLastPurgeTime();
  }
}

// set the hooked modules to a global object so other functions can access them
function setHookedModules(...modules) {
  modules.forEach(function (module, key) {
    let moduleName = HOOK_MODULES[key].split(".")[0]; // some module names have an extension like ".bs"
    Modules[moduleName] = module;
  });
}
