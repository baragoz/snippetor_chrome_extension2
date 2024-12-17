// background.js

let activeSnippet = "";

chrome.runtime.onInstalled.addListener(() => {

  console.log("GitHub Note Extension installed.");

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  console.log("GitHub set panel action.");
  
  //
  // snippets - list of user working or playing snippets
  // active_snippet_id - id of an active snippet
  // TODO: later - make a mapping for tabid <-> active snippet id
  //
  chrome.storage.sync.get({ snippets: [], active_snippet: -1, version: "1.0" }, (data) => {
    activeSnippet = data.active_snippet;
    // Note: at this point we can add a snippet data migration on version update 
    chrome.storage.sync.set({ snippets: data.snippets, active_snippet: data.active_snippet, version: "1.0" }, () => {
      console.log("Notes storage initialized.");
    });
 });
});


// Listener to handle any additional actions or future features
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SnBackground.saveNote" && message.note) {
    chrome.storage.sync.get({ active_snippet: -1 }, (data) => {
      //
      // Prevent user to add snippet to unknow destination
      //
      const activeSnippetId = data.active_snippet;
      if (!activeSnippetId || activeSnippetId < 0) {
         sendResponse({ success: false, error: "there is no active snippet." });
         return;
      }
      //
      // chrome.storage should notify all listener by default
      //
      const notesUid = `notes_${activeSnippetId}`;
      const activeNoteUid = `active_note_${activeSnippetId}`;
    
      chrome.storage.sync.get({ [notesUid]: [], [activeNoteUid]: -1 }, (data) => {
        var notes = data[notesUid] || [];

        // adding a new note right after the oldActiveNote and make it as active note
        const oldActiveNote = data[activeNoteUid];
        const newActiveNote = (oldActiveNote >= 0 && oldActiveNote < notes.length ) ? (oldActiveNote + 1) : notes.length;

        // update the list of notes
        var updatedNotes = [...notes];
        message.note.id = Date.now();
        updatedNotes.splice(newActiveNote, 0, message.note);


      const isLastNote = newActiveNote >= (updatedNotes.length - 1);

      console.log("DEBUG UPDATE NOTEs");
        // Note: please, do not join these 2 updates
        chrome.storage.sync.set({ [notesUid]: updatedNotes}, () => {
          console.log("DEBUG UPDATE NOTEs DONE");
          chrome.storage.sync.set({ [activeNoteUid]: newActiveNote}, () => {
            console.log("DEBUG UPDATE ACTIVE NOTE DONE");
            sendResponse({
              success: true,
              noteId: message.note.id,
              snippetId: activeSnippetId,
              hasNext: !isLastNote, // not the last note in a list
              hasPrev: updatedNotes.length > 1  // has more than 1 note in a list
            });
            console.log("DEBUG NOTIFY");

            if (newActiveNote > 0 && isLastNote && oldActiveNote >= 0) {
              const oldNote = updatedNotes[oldActiveNote];
              //
              // notify prev that it is not the last one any more,
              //
              notifyTabsNoteChange("onNoteUpdate", {
                nid: oldNote.id,
                sid: activeSnippetId,
                text: oldNote.text,
                url: oldNote.url,
                hasNext: true, // prev note now is not the last note in a list
                hasPrev: oldActiveNote > 0  // not the first element
              }, false);  
            }
            //
            // Show a new snippet circle for another tab with the same URL
            //
            notifyTabsNoteChange("onNoteAdd", {
              nid: message.note.id,
              sid: activeSnippetId,
              text: message.note.text,
              url: message.note.url,
              hasNext: !isLastNote, // not the last note in a list
              hasPrev: updatedNotes.length > 1  // has more than 1 note in a list
            }, message.isContentScript);
          }); // update active_note_$id
        }); // update notes_$id
      }); // get notes_$id and active_note_$id
    }); // Get active snippet ID 
    return true;
  }

  if (message.action === "SnBackground.updateNote") {
    if (!message.note) {
      return sendResponse({ success: false, error: "There is no note attached to the message." });
    } 
    
    if (message.note.id <= 0) {
      return sendResponse({ success: false, error: "Unexpected note id." });
    }

    // Update note which was assigned to some snippet
    if (message.snippetId <= 0) {
      return sendResponse({ success: false, error: "Unexpected snippet id." });
    }

    const snippetId = message.snippetId;
    const notesUid = `notes_${snippetId}`;
    // Get the existing notes from storage
    chrome.storage.sync.get({ [notesUid]: [] }, (data) => {
      var notes = data[notesUid] || [];
      // Find the index of the note to be updated
      const noteIndex = notes.findIndex((note) => note.id === message.note.id);
  
      if (noteIndex === -1) {
        // Note not found
        return sendResponse({ success: false, error: "Note not found." });
      }
  
      // Update the note
      // TODO: clean up notes before save on a website,
      //       (because at this place we are adding an extra fields to the note)
      notes[noteIndex] = { ...notes[noteIndex], ...message.note };
  
      // Save the updated notes back to storage
      chrome.storage.sync.set({ [notesUid]: notes }, () => {
        sendResponse({ success: true, noteId: message.note.id, snippetId: snippetId });
        //
        // Notify all tabs with given URL
        //
        notifyTabsNoteChange("onNoteUpdate", {
          nid: notes[noteIndex].id,
          sid: snippetId,
          text: notes[noteIndex].text,
          url: notes[noteIndex].url,
          hasNext: noteIndex < (notes.length - 1),
          hasPrev: noteIndex > 0,
        });
      });
    });
  
    return true;
  }

  if (message.action === "SnBackground.removeNote") {
    if (!message.note) {
      return sendResponse({ success: false, error: "There is no note attached to the message." });
    } 
    
    if (message.note.id === undefined || message.note.id <= 0) {
      return sendResponse({ success: false, error: "Invalid note id." });
    }

    // Update note which was assigned to some snippet
    if (message.snippetId === undefined || message.snippetId <= 0) {
      return sendResponse({ success: false, error: "Invalid snippet id." });
    }

    const snippetId = message.snippetId;
    const notesUid = `notes_${snippetId}`;
    const activeUid = `active_note_${snippetId}`;
    // Get the existing notes from storage
    chrome.storage.sync.get({ [notesUid]: [], [activeUid]: -1 }, (data) => {

      let rmIndex = -1;
      const notes = (data[notesUid] || []).filter((note, index) => {
        if (note.id !== message.note.id) {
          return true;
        } else {
          rmIndex = index;
          return false;
        }
      });
      const newActiveId = (message.note.id == data[activeUid]) ? -1 : data[activeUid];
      const oldActiveId = data[activeUid];


      chrome.storage.sync.set({ [notesUid]: notes, [activeUid]: newActiveId }, () => {
        //
        // Note removed, now return result and then update all affected tabs
        //
        sendResponse({ success: true }); 
        //
        // Notify all tabs with given URL
        //
        notifyTabsNoteChange("onNoteRemove", {
          nid: message.note.id,
          sid: snippetId,
          text: message.note.text,
          url: message.note.url
        });

        // 1. we still have some notes
        // 2. check if we removed first or last index
        //    if so, notify subling note that it need to update hasNext/hasPrev
        if (notes.length > 0  && rmIndex >= 0 && (rmIndex == 0 || rmIndex == notes.length)) {
          const updateIndex = (rmIndex == 0) ? 0 : notes.length -1;
          const updateNote = notes[updateIndex];
          //
          // notify prev that it is not the last one any more,
          //
          notifyTabsNoteChange("onNoteUpdate", {
            nid: updateNote.id,
            sid: snippetId,
            text: updateNote.text,
            url: updateNote.url,
            hasNext: (updateIndex < notes.length - 1), // update note is not the last note in a list
            hasPrev: updateIndex > 0  // and not the first element in the list
          }, false);  
        }

        });
    });

    return true;
  }
  

  if (message.action === "SnBackground.getNotesForUrl") {
    let sanitizedUrl = sanitizeUrl(message.url);
    const notesUid = `notes_${activeSnippet}`;
    const activeNoteUid = `active_note_${activeSnippet}`;
    chrome.storage.sync.get({ [notesUid]: [], [activeNoteUid]: -1 }, (data) => {
      console.log("LOADED DATA IS:", data);
      let filteredNotes = [];
      if (data[notesUid]){
        filteredNotes = data[notesUid].filter((note, index) => {
          const noteUrl = sanitizeUrl(note.url);
          note.sid = activeSnippet
          note.hasPrev = index != 0;
          note.hasNext = index != (data[notesUid].length - 1);
          return noteUrl == sanitizedUrl;
        });
      }

      var activeNote = 0;
      const activeIndex = data[activeNoteUid];
      if (activeIndex >=0 && activeIndex < data[notesUid].length) {
        activeNote = data[notesUid][activeIndex].id;
      }
      
      sendResponse({ notes: filteredNotes, active_note: activeNote, active_snippet: activeSnippet, error: "" });
    });
    return true;
  }

  if (message.action === "SnBackground.setActiveSnippet") {
    if (message.snippetId > 0) {
      activeSnippet = `${message.snippetId}`;
    } else {
      activeSnippet = "";
    }
    // save snippet to the load storage to reload it on reboot
    chrome.storage.sync.set( {active_snippet: message.snippetId});
    sendResponse({ success: true });
    return true;
  }

  //
  // It is shared functionality: snippet could be removed by site OR
  //                             by side panel command
  //
  if (message.action === "SnBackground.removeSnippet") {
    if (message.snippetId === undefined || message.snippetId <= 0) {
      return sendResponse({ success: false, error: "Invalid argument. Snippet uid is invalid." });
    }

    //
    // 1. Remove snippet from list of snippet
    // 2. Update active_snippet if it was active snippet
    // 3. remove snippet's notes and active_note keys
    // 4. Notify corresponding tabs about snippet close
    //
    const rmNotesId = "notes_" + message.snippetId;
    const rmActiveNoteUid = `active_note_${message.snippetId}`;
    activeSnippet = "";

    // get all snippet headers
    chrome.storage.sync.get({ snippets: [], active_snippet: -1, [rmNotesId]: [] }, (data) => {
      // update the list of snippet headers
      const updatedSnippets = data.snippets.filter((s) => s.id !== message.snippetId);
      const rmNotes = data[rmNotesId];
      //
      // Note: snippet remove could be requested from the web-site
      //       that's why we need to update an active snippet.
      //
      // Save an updated list of snippets and
      // reset an active_snippet if needed
      //
      const updateActive = (data.active_snippet == message.snippetId) ? -1 : data.active_snippet;
      chrome.storage.sync.set({ snippets: updatedSnippets, active_snippet: updateActive }, () => {
        // Send respond to the snippet remove requester
        sendResponse({ success: true });

        //
        // Remove the list of notes and active note id
        // for the removed snippet
        //
        chrome.storage.sync.remove( [rmActiveNoteUid, rmNotesId], () => {
          // Notify opened tabs about removed snippet
          notifyTabsSnippetRemove(message.snippetId, rmNotes);
        });
      });
    });
    return true;
  }

  //
  // Notify tabs about note changes
  //
  if (message.action === "SnBackground.broadcast") {
    const data = message.data;
    const sanitizedUrl = (data.url && data.url != "") ?  [sanitizeUrl(data.url)] : data.urls;

    // Do nothing if there is no urls for broadcast
    if (!sanitizedUrl || sanitizedUrl.length == 0)
      return

    chrome.tabs.query({}, function(tabs) {
        tabs.forEach((tab) => {
            if (tab.url) {
                const sanitizedTabUrl = sanitizeUrl(tab.url);
                if (sanitizedUrl.includes(sanitizedTabUrl)) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: data.action, // onNoteUpte, onNoteRemove
                        nid: data.nid || -1,
                        nids: data.nids || [],
                        sid: data.sid || -1,
                        text: data.text || ""
                    });
                }
            }
        });
    });
  }

  if (message.action == "SnBackground.openSiblingNoteInCurrentTab") {
    if (!message.note) {
      return sendResponse({ success: false, error: "There is no note attached to the message." });
    } 
    
    if (message.note.id <= 0) {
      return sendResponse({ success: false, error: "Unexpected note id." });
    }

    // Update note which was assigned to some snippet
    if (message.snippetId <= 0) {
      return sendResponse({ success: false, error: "Unexpected snippet id." });
    }

    const snippetId = message.snippetId;
    const notesUid = `notes_${snippetId}`;
    // Get the existing notes from storage
    chrome.storage.sync.get({ [notesUid]: [] }, (data) => {
      var notes = data[notesUid] || [];
      // Find the index of the note to be updated
      let noteIndex = notes.findIndex((note) => note.id === message.note.id);
  
      if (noteIndex === -1) {
        // Note not found
        sendResponse({ success: false, error: "Note not found." });
        return;
      }

      if (message.goNext) {
        if (noteIndex >= data[notesUid].length - 1) {
          sendResponse({ success: false, error: "There is no next note." });
          return;
        }
        // load next note
        noteIndex++;
      } else if (message.goPrev) {
         if (noteIndex <= 0) {
          sendResponse({ success: false, error: "There is no previous note." });
          return;
         }
         --noteIndex;
      }

      // now we know the next active note
      let workingNote = data[notesUid][noteIndex];

      // Update an active note
      const activeUid = `active_note_${message.snippetId}`;
      chrome.storage.sync.set({ [activeUid]: noteIndex });      

      if (!workingNote.url) {
        sendResponse({ success: false, status: "error", message: "URL is missing" });
        return;
      }
      // Send success and update tabs
      // sendResponse({ success: true });

      const url = workingNote.url;
      const sanitizedUrl = this.sanitizeUrl(url);
      // load next note in the current tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            // Update the current active tab with the new URL
            sendResponse({ success: true, message: "Tab update request send" });

            //
            // Work-around for navigate the same url except hash
            //
            const tabUrl = this.sanitizeUrl(tabs[0].url);
            if (sanitizedUrl === tabUrl) {
              // Notify current tab about active change
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "onNoteSelect",
                nid: workingNote.id,
                sid: message.snippetId,
              });
            }
            // Reloading current tab, need to send response first
            chrome.tabs.update(tabs[0].id, { url: url }, () => {
                console.log(`Tab updated to URL: ${url}`);
                // sendResponse({ status: "success", message: "Tab updated successfully" });
            });
        } else {
            console.error("No active tab found");
            sendResponse({ status: "error", message: "No active tab found" });
        }
      });
    });
    return true;
  }

  if (message.action === "SnBackground.openNoteInCurrentTab") {
    const url = message.url; // Extract the URL from the message
    if (url) {
        const sanitizedUrl = this.sanitizeUrl(url);
        // Query the active tab in the current window
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {

                const tabURL = this.sanitizeUrl(tabs[0].url);

                console.log("TAB URL IS", [tabURL, sanitizedUrl]);
                //
                //  Use-case  when we switch between the same url
                //  URL#L20  -> URL#L60
                //
                if (sanitizedUrl == tabURL) {
                  // Notify current tab about active change
                  chrome.tabs.sendMessage(tabs[0].id, {
                    action: "onNoteSelect",
                    nid: message.noteId,
                    sid: message.snippetId,
                  });
                }

                // Update the current active tab with the new URL
                chrome.tabs.update(tabs[0].id, { url: url }, () => {
                  
                    console.log(`Tab updated to URL: ${url}`);

                    // Send RESPONSE TO THE SIDE PANEL 
                    sendResponse({ status: "success", message: "Tab updated successfully" });

                });
            } else {
                console.error("No active tab found");
                sendResponse({ status: "error", message: "No active tab found" });
            }
        });
    } else {
        console.error("URL not provided in the message");
        sendResponse({ success: false, status: "error", message: "URL is missing" });
    }
    // Indicate that the response will be sent asynchronously
    return true;
  }

  return false;
});


// Function to sanitize URLs
// Keeps origin and pathname, removes query params and fragments
function sanitizeUrl(url) {
  try {
      const urlObject = new URL(url);
      const pathname = urlObject.pathname.split(";")[0];
      return `${urlObject.origin}${pathname}`;
  } catch (error) {
      console.error("Error sanitizing URL:", error);
      return url; // If URL parsing fails, return the original URL
  }
}

function notifyTabsNoteChange(action, data, excludeCurrentTab = false) {
    const sanitizedUrl = sanitizeUrl(data.url);

    console.log("NOTIFY TAB CHANGE");
    // Do nothing if there is no urls for broadcast
    if (!sanitizedUrl || sanitizedUrl == "")
      return
    try {
    chrome.tabs.query({}, function(tabs) {
      try {
        tabs.forEach((tab) => {
            // Skip the current active tab if excludeCurrentTab is true
            if (excludeCurrentTab && tab.active && tab.highlighted) {
              return;
            }
            if (tab.url) {
                const sanitizedTabUrl = sanitizeUrl(tab.url);
                if (sanitizedUrl.includes(sanitizedTabUrl)) {
                    chrome.tabs.sendMessage(tab.id, {
                      action: action, // onNoteUpdate, onNoteRemove
                      nid: data.nid,
                      sid: data.sid,
                      text: data.text,
                      url: data.url,
                      hasNext: data.hasNext,
                      hasPrev: data.hasPrev
                    });
                }
            }
        });
      } catch (error) {
        console.error(' WRONG tab send ??? Unexpected error:', error);
      }
    });
  } catch (error) {
    console.error('WRONG TABS ??? ?Unexpected error:', error);
}
    console.log("NOTIFY TAB CHANGE COMPLETE");
}

//
// Collect all urls in notes and notify the corresponding tabs
// about snippet close or remove
//
function notifyTabsSnippetRemove(snId, notes) {
  // Collect and sanitize all URLs from notes, ensuring they are unique
  const sanitizedUrlsSet = new Set();
  const noteIds = [];

  notes.forEach(note => {
      // Sanitize the URL and add it to the set
      const sanitizedUrl = sanitizeUrl(note.url);
      sanitizedUrlsSet.add(sanitizedUrl);

      // Add note id to noteIds array
      noteIds.push(note.id);
  });

  // Convert the Set to an array to get unique sanitized URLs
  const uniqueSanitizedUrls = Array.from(sanitizedUrlsSet);

  chrome.tabs.query({}, function(tabs) {
    tabs.forEach((tab) => {
        if (tab.url) {
            const sanitizedTabUrl = sanitizeUrl(tab.url);
            if (uniqueSanitizedUrls.includes(sanitizedTabUrl)) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "onSnippetRemove",
                    nids: noteIds,
                    sid: snId
                });
            }
        }
    });
  });
}