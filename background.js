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
    chrome.storage.sync.set({ snippets: data.snippets, active_snippet: data.active_snippet, version: "1.0", tabs_map: [] }, () => {
      console.log("Notes storage initialized.");
    });
 });
});

//
// We need an active tab id to show/hide a pinned tab
//
chrome.tabs.onActivated.addListener((activeInfo) => {
  // Save the active tab ID to chrome.storage
  chrome.storage.sync.set({ active_tab_id: activeInfo.tabId }, () => {
    console.log("Active tab ID saved:", activeInfo.tabId);
  });
});

//
// Remove tab from map, on tab close
//
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log("Tab closed:", tabId);

  // Remove the closed tab from 'tabs_map' in chrome.storage
  chrome.storage.sync.get({ tabs_map: [] }, (data) => {
    const index = data.tabs_map.findIndex(item => item.tabId === tabId);

    if (index !== -1) {
      // Tab exists in the list, proceed to remove it
      const updatedTabsMap = data.tabs_map.filter(item => item.tabId !== tabId);
      chrome.storage.sync.set({ tabs_map: updatedTabsMap }, () => {
        console.log(`Tab with tabId ${tabId} removed from tabs_map.`);
      });
    } else {
      console.log(`Tab with tabId ${tabId} not found in tabs_map.`);
    }
  });
});


//
// Note: work-around for background service unload
//       Chrome disable the background service too often
//
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get({ active_snippet: -1 }, (data) => {
    activeSnippet = data.active_snippet;
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

      message.note.hasNext = !isLastNote;
      message.note.hasPrev = updatedNotes.length > 1;

      console.log("DEBUG UPDATE NOTEs");
        // Note: please, do not join these 2 updates
        chrome.storage.sync.set({ [notesUid]: updatedNotes}, () => {
          console.log("DEBUG UPDATE NOTEs DONE");
          chrome.storage.sync.set({ [activeNoteUid]: newActiveNote}, () => {
            console.log("DEBUG UPDATE ACTIVE NOTE DONE");
            sendResponse({
              success: true,
              note: message.note,
              snippetId: activeSnippetId,
            });
            console.log("DEBUG NOTIFY");

            if (newActiveNote > 0 && isLastNote && oldActiveNote >= 0) {
              let oldNote = updatedNotes[oldActiveNote];
              oldNote.hasNext = true; // prev note now is not the last note in a list
              oldNote.hasPrev = oldActiveNote > 0; // not the first element
              //
              // notify prev that it is not the last one any more,
              //
              notifyTabsNoteChange("onNoteUpdate", {
                note: oldNote,
                snippetId: activeSnippetId,
              }, false);  
            }
            //
            // Show a new snippet circle for another tab with the same URL
            //
            notifyTabsNoteChange("onNoteAdd", {
              note: message.note,
              snippetId: activeSnippetId
            }, message.isContentScript);
          }); // update active_note_$id
        }); // update notes_$id
      }); // get notes_$id and active_note_$id
    }); // Get active snippet ID 
    return true;
  }

  if (message.action === "SnBackground.updateNote") {
    if (!message.note) {
      return sendResponse({ success: false, error: "Interface error. There is no note argument attached to the message." });
    } 
    
    if (message.note.id <= 0) {
      return sendResponse({ success: false, error: "Unexpected note id." });
    }

    // Update note which was assigned to some snippet
    if (message.snippetId <= 0) {
      return sendResponse({ success: false, error: "Interface error. Unexpected snippet id." });
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
        return sendResponse({ success: false, error: "Interface error. Note id not found." });
      }
  
      // Update the note
      // TODO: clean up notes before save on a website,
      //       (because at this place we are adding an extra fields to the note)
      notes[noteIndex] = { ...notes[noteIndex], ...message.note };

      let resultNote = { ...notes[noteIndex]};
      resultNote.hasNext = noteIndex < (notes.length - 1);
      resultNote.hasPrev = noteIndex > 0;
  
      // Save the updated notes back to storage
      chrome.storage.sync.set({ [notesUid]: notes }, () => {
        sendResponse({ success: true, note: resultNote, snippetId: snippetId });
        //
        // Notify all tabs with given URL
        //
        notifyTabsNoteChange("onNoteUpdate", {
          note: resultNote,
          snippetId: snippetId,
        });
      });
    });
  
    return true;
  }

  if (message.action === "SnBackground.removeNote") {
    //
    // Note: we need note.url to find curresponding tabs
    //       that's why it is easier to send an entire note
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
    const activeNoteUid = `active_note_${snippetId}`;
    // Get the existing notes from storage
    chrome.storage.sync.get({ [notesUid]: [], [activeNoteUid]: -1 }, (data) => {

      let rmIndex = -1;
      const notes = (data[notesUid] || []).filter((note, index) => {
        if (note.id !== message.note.id) {
          return true;
        } else {
          rmIndex = index;
          return false;
        }
      });
      const newActiveId = (message.note.id == data[activeNoteUid]) ? -1 : data[activeNoteUid];
      const oldActiveId = data[activeNoteUid];


      chrome.storage.sync.set({ [notesUid]: notes, [activeNoteUid]: newActiveId }, () => {
        //
        // Note removed, now return result and then update all affected tabs
        //
        sendResponse({ success: true }); 
        //
        // Notify all tabs with given URL
        //
        notifyTabsNoteChange("onNoteRemove", {
          note: message.note,
          snippetId: snippetId
        });

        // 1. we still have some notes
        // 2. check if we've removed first or last index
        //    if so, notify subling note that it need to update hasNext/hasPrev
        if (notes.length > 0  && rmIndex >= 0 && (rmIndex == 0 || rmIndex == notes.length)) {
          const updateIndex = (rmIndex == 0) ? 0 : notes.length -1;
          let updateNote = { ...notes[updateIndex] };
          updateNote.hasNext = (updateIndex < notes.length - 1);
          updateNote.hasPrev = updateIndex > 0;
          //
          // notify prev that it is not the last one any more,
          //
          notifyTabsNoteChange("onNoteUpdate", {
            note: updateNote,
            snippetId: snippetId
          }, false);  
        }

        });
    });

    return true;
  }
  

  if (message.action === "SnBackground.getNotesForUrl") {
    // get active snippet first
    chrome.storage.sync.get({ tabs_map: [], active_snippet: -1, active_tab_id: -1 }, (data) => {
      var currentSnippet = data.active_snippet;
      var currentNote = -1;
      const activeTabId = data.active_tab_id;

      console.log("REQUEST FOR URL:", data);

      // Check that tabs map for the mapped snippet
      let tabsMap = data.tabs_map;
      let index = tabsMap.findIndex(item => item.tabId === activeTabId);
      var isReady = false;
      let hasActiveSnippet = !(data.active_snippet == "" || data.active_snippet == -1);
      if (index >= 0) {
        let tab = tabsMap[index];
        console.log("TAB IS TAB :", tab);
        isReady =  (tab.state == "pinned");
        if (isReady) {
          currentSnippet = tab.snippetId;
          currentNote = tab.activeNote;
        }
      } else {
        console.log("NO TAB INDEX FOUND");
        if (!hasActiveSnippet) {
          sendResponse({ notes: [], activeNoteId: -1, snippetId: -1, error: "" });
          return;
        }
      }

      let sanitizedUrl = sanitizeUrl(message.url);
      const notesUid = `notes_${currentSnippet}`;
      const activeNoteUid = `active_note_${currentSnippet}`;

      console.log("LOOKING FOR : " + notesUid );
      
      //
      // Read current snippet
      //
      chrome.storage.sync.get({ [notesUid]: [], [activeNoteUid]: -1 }, (data) => {
        let filteredNotes = [];
        if (data[notesUid]) {
          filteredNotes = data[notesUid].filter((note, index) => {
            const noteUrl = sanitizeUrl(note.url);
            note.sid = currentSnippet
            note.hasPrev = index != 0;
            note.hasNext = index != (data[notesUid].length - 1);
            return noteUrl == sanitizedUrl;
          });
        }
  
        var activeNoteId = -1;
        const activeIndex = (!isReady && hasActiveSnippet) ?  data[activeNoteUid] : currentNote;
        if (activeIndex >= 0 && activeIndex < data[notesUid].length) {
          activeNoteId = data[notesUid][activeIndex].id;
        }
        
        sendResponse({ notes: filteredNotes, activeNoteId: activeNoteId, snippetId: currentSnippet, error: "" });
      });
  
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
    chrome.storage.sync.get({ [notesUid]: [], tabs_map: [], active_tab_id: -1 }, (data) => {
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

      if (!workingNote.url) {
        sendResponse({ success: false, status: "error", message: "URL is missing" });
        return;
      }
      // Send success and update tabs
      // sendResponse({ success: true });


      ////////////////////////// UPDATE ACTIVE NOTE
      //
      // tabs_map - for pinned snippets
      // active_note_${snippetId} - for active snippet
      //
      let index = data.tabs_map.findIndex(item => item.tabId === data.active_tab_id);
      let shouldUpdateActive = true;
      if (index >= 0) {
        let val = data.tabs_map[index];
        // Current tab is in pinned state
        if (val.state == "pinned") {
          shouldUpdateActive = false;
          data.tabs_map[index].activeNote = noteIndex;
          // Save activeNote to the site map
          chrome.storage.sync.set({ tabs_map: data.tabs_map });
        }
      }

      if (shouldUpdateActive) {
        // Update an active note
        const activeUid = `active_note_${message.snippetId}`;
        chrome.storage.sync.set({ [activeUid]: noteIndex });      

      }

      ////////////////////////// OPEN URL
      const url = workingNote.url;
      const sanitizedUrl = this.sanitizeUrl(url);
      // load next note in the current tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            // Update the current active tab with the new URL
            sendResponse({ success: true, message: "Tab update request send" });

            console.log("GOT TABS !!!!", tabs);
            //
            // Work-around for navigate the same url except hash
            //
            const tabUrl = this.sanitizeUrl(tabs[0].url);
            if (sanitizedUrl === tabUrl) {
              // Notify current tab about active change
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "onNoteSelect",
                noteId: workingNote.id,
                snippetId: message.snippetId,
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
                    noteId: message.noteId,
                    snippetId: message.snippetId,
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

  //
  // Open snippet in a new tab and pin it
  //
  if (message.action === "SnBackground.openAsPinnedSnippet") {
    chrome.tabs.create({ url: message.url || "about:blank" }, (tab) => {
      if (tab) {
        // Send response with the new tab ID
        sendResponse({ success: true, tabId: tab.id });
        
        //
        // Make a new pair tabId + snippetId to open url with data
        // 
        chrome.storage.sync.get({ tabs_map: [] }, (data) => {
          const val = { 
            snippetId: message.snippetId,
            tabId: tab.id,
            state: "pinned",
            refs: message.refs || "fixed", // Use fixed references on navigation
            activeNote: 0 };

            data.tabs_map.push(val);
            chrome.storage.sync.set({ tabs_map: data.tabs_map }, () => {
              chrome.tabs.update(tab.id, { url: message.url });
            });
        });
      }
      else {
        sendResponse({ success: false, tabId: -1, error: "Failed to create a new tab" });
      }
    });
    return true;
  }

  //
  // TODO: we could send message to the content script and reload
  //       data only, not page reload needed
  if (message.action === "SnBackground.forceContentDataReload") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.reload(tabs[0].id, {}, () => {
          sendResponse({ success: true, tabId: tabs[0].id});
        });
      }
    });
    return true;
  }

  if (message.action === "SnBackground.pinCurrentTab") {
    if (!message.snippetId) {
      sendResponse({ success: false, error: "Invalid argument snippet id"});
      return;
    }

    // 
    if (message.activeNote == undefined)
      message.activeNote =  -1;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      console.log("PIN TAB 2");
      if (tabs.length > 0) {
        let id = tabs[0].id;  // current tab id
        sendResponse({ success: true, tab_id: id});
        console.log("PIN TAB 3");
        chrome.storage.sync.get({ tabs_map: [] }, (data) => {
          const val = { 
            snippetId: message.snippetId,
            tabId: id,
            state: "pinned",  // indicates that we need to show pinned snippet on tab activation
            activeNote: message.activeNote };
          const existingIndex = data.tabs_map.findIndex(item => item.tabId === id);
          console.log("PIN TAB 4");
          if (existingIndex !== -1) {

            data.tabs_map[existingIndex] = val; // Update existing entry
          } else {
            data.tabs_map.push(val); // Add new entry
          }

          console.log("PIN TAB 5", data.tabs_map);
          chrome.storage.sync.set({ tabs_map: data.tabs_map, active_snippet: -1 });
        });
      }
      else {
        console.log("PIN TAB 2 ex");
        sendResponse({ success: false, error: "Faild to get an active tab id"});
        return;
      }
    });
    return true;
  }

  if (message.action === "SnBackground.unpinCurrentTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        let id = tabs[0].id;  // current tab id
        

        chrome.storage.sync.get({ tabs_map: [] }, (data) => {
          const updatedTabsMap = data.tabs_map.filter(item => item.tabId !== id);
          chrome.storage.sync.set({ tabs_map: updatedTabsMap }, () => {
            sendResponse({ success: true, tab_id: id});
          });
        });
      }
      else {
        sendResponse({ success: false, error: "Faild to get an active tab id"});
        return;
      }
    });
    return true;
  }

  if (message.action === "SnBackground.updateActiveNoteForPinnedTab") {
    console.log(" SnBackground.updateActiveNoteForPinnedTab STEP 1");
    if (message.snippetId < 0) {
      console.log(" SnBackground.updateActiveNoteForPinnedTab EXIT 1");
      sendResponse({ success: false, error: "Invalid snippet id " + message.snippetId});
      return;
    }
    chrome.storage.sync.get({ tabs_map: [], active_tab_id: -1 }, (data) => {
      console.log(" SnBackground.updateActiveNoteForPinnedTab STEP 2");
      const index = data.tabs_map.findIndex(item => item.tabId === data.active_tab_id);
      if (index < 0) {
        console.log(" SnBackground.updateActiveNoteForPinnedTab EXIT 2");
        sendResponse({ success: false, error: "Failed to find a pinned tab"});
        return;
      }
      data.tabs_map[index].activeNote = message.activeNote;

      console.log(" SnBackground.updateActiveNoteForPinnedTab STEP 3");
      //
      // Save and automatically notify about tabs_map change
      //
      chrome.storage.sync.set({ tabs_map: data.tabs_map }, () => {
        console.log(" SnBackground.updateActiveNoteForPinnedTab EXIT SUCCESS");
        console.log(`An active not index for tab with tabId ${data.active_tab_id} was updated.`);
      });

      sendResponse({ success: true, error: ""});

    });
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
    const sanitizedNoteUrl = sanitizeUrl(data.note.url);
    // Do nothing if there is no urls for notification
    if (!sanitizedNoteUrl || sanitizedNoteUrl == "")
      return
    try {
    chrome.tabs.query({}, function(tabs) {
      try {
        tabs.forEach((tab) => {
            // Skip the current active tab if excludeCurrentTab is true
            if (excludeCurrentTab && tab.active && tab.highlighted) {
              return;
            }
            //
            // skip muted tabs
            //
            if (tab.mutedInfo.muted) {
              return;
            }
            if (tab.url) {
                const sanitizedTabUrl = sanitizeUrl(tab.url);
                if (sanitizedNoteUrl.includes(sanitizedTabUrl)) {
                    chrome.tabs.sendMessage(tab.id, {
                      action: action, // onNoteUpdate, onNoteRemove
                      note: data.note,
                      snippetId: data.snippetId
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
                    noteIdList: noteIds,
                    snippetId: snId
                });
            }
        }
    });
  });
}