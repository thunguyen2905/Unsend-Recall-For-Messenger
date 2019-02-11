const EXTENSION_ID = "lfdpbdfgkiofcpmpcideafphnnpgcdcb";

// sends a message to the background script to return messages persisted in local storage
export function getPersistedMessages(callback) {
  chrome.runtime.sendMessage(EXTENSION_ID, {
    getPersistedMessages: true
  }, (response) => {
    callback(response);
  });
}

// sends a message to the background script to set receivedMessages in local storage
export function setReceivedMessages(receivedMessages) {
  chrome.runtime.sendMessage(EXTENSION_ID, {
    receivedMessages: JSON.stringify(receivedMessages)
  });
}

// sends a message to the background script to set removedMessages in local storage
export function setRemovedMessages(removedMessages) {
  chrome.runtime.sendMessage(EXTENSION_ID, {
    removedMessages: JSON.stringify(removedMessages)
  });
}

// sends a message to the background script to set lastPurgeTime in local storage
export function setLastPurgeTime() {
  chrome.runtime.sendMessage(EXTENSION_ID, {
    lastPurgeTime: new Date().getTime()
  });
}

// returns the removed message for a message removed by the current user (yourself)
export function _getViewerAuthorFbt(removedMessage) {
  return `You removed a message${getRemovedMessageText(removedMessage)}`;
}

// returns the removed message for a message removed by a contact
export function _getOtherAuthorFbt(name, removedMessage) {
  return `${name} removed a message${getRemovedMessageText(removedMessage)}` ;
}

// returns the removed message for a message removed by an unknown user
export function _getUnknownAuthorFbt(removedMessage) {
  return `A contact removed a message${getRemovedMessageText(removedMessage)}`;
}

// returns removedMessage if it's not null, else returns an empty string
function getRemovedMessageText(removedMessage) {
  return removedMessage ? `: ${removedMessage}` : '';
}

// returns a reduced form of the message object (only the necessary keys and values)
export function getReducedMessageObject({
  message_id,
  thread_id,
  offline_threading_id,
  author,
  body,
  has_attachment,
  attachments,
  timestamp
}) {
  return {
    message_id,
    thread_id,
    offline_threading_id,
    author,
    body,
    has_attachment,
    attachments,
    timestamp
  };
}