(() => {
  // Handle messages from the web page
  window.addEventListener("message", (event) => {
    if (!event.data.action?.startsWith("snippetAPI.")) return;

    console.log("GOT MESSAGE:  " + event.data.action + " WITH ID: " + event.data.id);
    console.log(event);
    switch (event.data.action) {

      //
      // read the list of snippets from chrome.storage
      //
      case "snippetAPI.getSnippets":
        // May be read active_snippet too?
        chrome.storage.sync.get({ snippets: [] }, (data) => {
          window.postMessage({ action: "snippetAPI.callback", id: event.data.id, result: data.snippets }, "*");
        });
        break;

      //
      // remove snippet from the list (on save or just remove)
      //
      case "snippetAPI.removeSnippet":
        chrome.storage.sync.get({ snippets: [], active_snippet: -1 }, (data) => {
          const updatedSnippets = data.snippets.filter((s) => s.id !== event.data.snippetId);
          const newActiveSnippet = (data.active_snippet == event.data.snippetId) ? -1 : data.active_snippet;

          // Update snippets list, active_snippet, and remove corresponding notes_$id and  active_note_$id
          chrome.storage.sync.set({ snippets: updatedSnippets, active_snippet: newActiveSnippet }, () => {
            chrome.storage.sync.remove([`notes_${event.data.snippetId}`, `active_note_${event.data.snippetId}`], () => {
              window.postMessage({ action: "snippetAPI.callback", id: event.data.id, result: true }, "*");
            });
          });
        });
        break;

      //
      // load snippet from backend to extension
      //
      case "snippetAPI.loadSnippet":
        //
        // Wrap snippet with local id to avoid collisions
        // Keep an original backend ID - backId
        //
        var sdata = event.data.snippet; // snippet data
        sdata.backId = sdata.id;
        sdata.id = Date.now();

        //
        // need some unique ids for all notes
        //
        event.data.notes.forEach((note, noteIndex) => {
          note.id = sdata.id - 300 + noteIndex;
        });

        // get the latest snippets list
        chrome.storage.sync.get({ snippets: [] }, (data) => {
          const updatedSnippets = [...data.snippets, sdata];
          // save an updated list
          chrome.storage.sync.set({ snippets: updatedSnippets }, () => {
            // Keep notes under the local snippet id, not the original one
            // it is allow user to open the same snippet multiple times
            chrome.storage.sync.set({
              [`notes_${sdata.id}`]: event.data.notes,
              [`active_note_${sdata.id}`]: 0
            }, () => {
              // event.data.id - is callback id, which should be called on processing completion
              window.postMessage({ action: "snippetAPI.callback", id: event.data.id, result: true }, "*");

              //
              // Force snippet to open snippet in a new tab and pin it to that tab
              //
              if (event.data.notes.length > 0) {
                chrome.runtime.sendMessage({
                  action: "SnBackground.openAsPinnedSnippet",
                  snippetId: sdata.id,
                  activeNote: 0,
                  url: event.data.notes[0].url
                });
              }

            });
          });
        });
        break;

      //
      // Get all snippet notes
      //
      case "snippetAPI.getNotesById":
        chrome.storage.sync.get({ [`notes_${event.data.snippetId}`]: [] }, (data) => {
          window.postMessage({ action: "snippetAPI.callback", id: event.data.id, result: data[`notes_${event.data.snippetId}`] }, "*");
        });
        break;

      //
      // update snippet's notes if modified
      //
      case "snippetAPI.updateNotes":
        chrome.storage.sync.set({ [`notes_${event.data.snippetId}`]: event.data.notes }, () => {
          window.postMessage({ action: "snippetAPI.callback", id: event.data.id, result: true }, "*");
        });
        break;

      //
      // subscribe for the storage data updates
      //
      case "snippetAPI.onUpdate":
        chrome.storage.onChanged.addListener((changes, namespace) => {
          window.postMessage({ action: "snippetAPI.listener", result: { changes, namespace } }, "*");
        });
        break;
    }
  });
})();
