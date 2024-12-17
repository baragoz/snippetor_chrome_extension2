// script.js

class SnippetManager {
  constructor() {
      this.noteList = document.getElementById("dw-note-list");
      this.currentSnippetTitle = document.getElementById("dw-current-snippet-title");
      this.mainContainer = document.getElementById("dw-main-container");
      this.mainSnippetList = document.getElementById("dw-snippet-list-wrapper");
      this.currentSnippetId = null;
      this.activeNote = -1;

      this.icons = {
          new: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M280-160v-441q0-33 24-56t57-23h439q33 0 56.5 23.5T880-600v320L680-80H360q-33 0-56.5-23.5T280-160ZM81-710q-6-33 13-59.5t52-32.5l434-77q33-6 59.5 13t32.5 52l10 54h-82l-7-40-433 77 40 226v279q-16-9-27.5-24T158-276L81-710Zm279 110v440h280l160-160v-280H360Zm220 220Zm-40 160h80v-120h120v-80H620v-120h-80v120H420v80h120v120Z"/></svg>`,
          play: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/></svg>`,
          editIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M160-120v-170l527-526q12-12 27-18t30-6q16 0 30.5 6t25.5 18l56 56q12 11 18 25.5t6 30.5q0 15-6 30t-18 27L330-120H160Zm80-80h56l393-392-28-29-29-28-392 393v56Zm560-503-57-57 57 57Zm-139 82-29-28 57 57-28-29ZM560-120q74 0 137-37t63-103q0-36-19-62t-51-45l-59 59q23 10 36 22t13 26q0 23-36.5 41.5T560-200q-17 0-28.5 11.5T520-160q0 17 11.5 28.5T560-120ZM183-426l60-60q-20-8-31.5-16.5T200-520q0-12 18-24t76-37q88-38 117-69t29-70q0-55-44-87.5T280-840q-45 0-80.5 16T145-785q-11 13-9 29t15 26q13 11 29 9t27-13q14-14 31-20t42-6q41 0 60.5 12t19.5 28q0 14-17.5 25.5T262-654q-80 35-111 63.5T120-520q0 32 17 54.5t46 39.5Z"/></svg>',
          cancelIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fefefe"><path d="m336-280 144-144 144 144 56-56-144-144 144-144-56-56-144 144-144-144-56 56 144 144-144 144 56 56ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>',
          doneIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fefefe"><path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>',
          arrowDownIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/></svg>',
          arrowUpIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>',
          newIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M440-240h80v-120h120v-80H520v-120h-80v120H320v80h120v120ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg>',
      };

      this.init();
      this.initStorageChangeListener();
  }

  init() {
      // Initialize event listeners
      document.getElementById("dw-save-snippet").addEventListener("click", () => this.saveSnippet());
      document.getElementById("dw-remove-snippet").addEventListener("click", () => this.removeSnippet());
      document.getElementById("dw-notes-prev").addEventListener("click", () => this.handlePrevNote());
      document.getElementById("dw-notes-next").addEventListener("click", () => this.handleNextNote());

      this.currentSnippetTitle.addEventListener("blur", () => this.updateSnippetTitle());

      // Render initial snippets
      this.renderSnippets();
  }

  initStorageChangeListener() {
      // Listen for changes in chrome.storage.sync
      chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'sync') {
              for (let key in changes) {
                  if (key === 'snippets') {
                      this.renderSnippets();
                  } else if (key === 'active_snippet') {
                      const newSnippetId = changes[key].newValue;
                      if (newSnippetId !== this.currentSnippetId) {
                          this.loadSnippetById(newSnippetId);
                      }
                  } else if (key == `notes_${this.currentSnippetId}`) {
                    this.renderNotes(changes[key].newValue || []);
                    // Update an active note id
                    this.setActiveNote(this.activeNote, true);
                  } else if (key == `active_note_${this.currentSnippetId}`) {
                    console.log("GOT ACTIVE NOTE CHANGE : ", changes[key]);
                    this.setActiveNote(changes[key].newValue);
                  }
              }
          }
      });
  }

  //
  // Just update UI elements:
  // -- add/remove class for active note
  // -- update next/prev elements
  //
  // params:
  // force - force update, because whole list was reloaded
  //
  setActiveNote(idx, force = false) {
    if (idx < 0 || idx === undefined)
      return;
    // this method does not update active note value
    this.updateNextPrevDisabledState(this.activeNote, idx, force);
    // that's why I need to update it here:
    this.activeNote = idx;

  }

  renderSnippets() {
      chrome.storage.sync.get({ snippets: [], active_snippet: -1 }, (data) => {
          const snippetsDropdown = document.querySelector(".sn-dropdown-content");
          snippetsDropdown.innerHTML = `
              <a href="#" id="dw-new-snippet" class="sn-button">${this.icons.newIcon}New</a>
              <div class="sn-divider"></div>
          `;
          document.getElementById("dw-new-snippet").addEventListener("click", (e) => {
              e.preventDefault();
              this.createNewSnippet();
          });

          let active = null;
          data.snippets.forEach((snippet) => {
              const snippetElement = document.createElement("div");
              snippetElement.innerHTML = `
                  <a class='sn-button sn-recent-snippet' href='#'>${snippet.state === "new" ? this.icons.new : this.icons.play}&nbsp;${snippet.title}</a>`;
              snippetElement.dataset.id = snippet.id;

              snippetElement.addEventListener("click", () => {
                  this.loadSnippet(snippet);
              });

              snippetsDropdown.appendChild(snippetElement);
              if (snippet.id == data.active_snippet) {
                active = snippet;
              }
          });

          if (data.active_snippet >= 0) {
            this.loadSnippet(active);
          } else {
            this.mainContainer.classList.add("sn-snippet-mode");
            // add new button
            this.mainSnippetList.innerHTML = `
              <a href="#" id="dw-main-new-snippet" class="sn-button">${this.icons.newIcon}New</a>
              <div class="sn-divider"></div>
            `;
            document.getElementById("dw-main-new-snippet").addEventListener("click", (e) => {
              e.preventDefault();
              this.createNewSnippet();
            });

            data.snippets.forEach((snippet) => {
              const snippetElement = document.createElement("div");
              snippetElement.innerHTML = `
                  <a class='sn-button sn-recent-snippet' href='#'>${snippet.state === "new" ? this.icons.new : this.icons.play}&nbsp;${snippet.title}</a>`;
              snippetElement.dataset.id = snippet.id;

              snippetElement.addEventListener("click", () => {
                  this.loadSnippet(snippet);
              });

              this.mainSnippetList.appendChild(snippetElement);
          });
          }
      });
  }

  loadSnippet(snippet) {
      this.currentSnippetId = snippet.id;
      this.activeNote = -1;
      this.setActiveSnippet(this.currentSnippetId);
      this.currentSnippetTitle.contentEditable = true;
      this.currentSnippetTitle.textContent = snippet.title;

      this.mainContainer.classList.remove("sn-snippet-mode");

      const notesUid = `notes_${this.currentSnippetId}`;
      const activeNoteUid = `active_note_${this.currentSnippetId}`;
      chrome.storage.sync.get({[notesUid]: [], [activeNoteUid]: -1 } , (data) => {
        // render notes
        this.renderNotes(data[notesUid] || []);
        // show active note (no url loading)
        this.setActiveNote(data[activeNoteUid]);
      });
  }

  loadSnippetById(snippetId) {
      chrome.storage.sync.get({ snippets: [] }, (data) => {
          const snippet = data.snippets.find(s => s.id === snippetId);
          if (snippet) {
              this.loadSnippet(snippet);
          }
      });
  }

  renderNotes(notes) {
    this.noteList.innerHTML = "";
    notes.forEach((note, noteIndex) => {
        const noteElement = document.createElement("div");
        noteElement.className = "dw-note collapsed";
        // TODO: re-work this code
        noteElement.setAttribute("sn-note-url", note.url);
        noteElement.setAttribute("sn-note-text", note.text);
        noteElement.setAttribute("sn-note-id", note.id);
        noteElement.innerHTML = `
            <div class="dw-note-header">
                <div class="dw-note-filename" title="${note.url}">${this.getFileName(note.url)}</div>
                <div class="dw-note-collapse" title="Collapse/Expand">${this.icons.arrowDownIcon}</div>
                <span class="dw-close-icon" title="Remove note">&times;</span>
            </div>
            <div class="dw-note-subheader">
                <span class="dw-github-icon" title="GitHub"></span>
                <span class="dw-repo-name">${this.getRepoName(note.url)}</span>
            </div>
            <div class="dw-note-wrapper">
                <div class="dw-note-edit" title="Edit text">${this.icons.editIcon}</div>
                <div class="dw-note-icons">
                    <div class="dw-icon-cancel" title="Cancel changes">${this.icons.cancelIcon}</div>
                    <div class="dw-icon-done" title="Update text">${this.icons.doneIcon}</div>
                </div>
                <p class="dw-note-text">${note.text}</p>
                <textarea class="dw-note-textarea" style="display: none;">${note.text}</textarea>
            </div>
        `;

        // Edit button click handler
        noteElement.querySelector(".dw-note-edit").addEventListener("click", () => {
            this.enterNoteEditMode(noteElement);
        });

        // Done icon click handler (acts like blur)
        noteElement.querySelector(".dw-icon-done").addEventListener("click", () => {
            this.exitNoteEditMode(note, noteElement, true);
        });

        // Cancel icon click handler
        noteElement.querySelector(".dw-icon-cancel").addEventListener("click", () => {
          console.log("EXIT VIA CANCEL");
            this.exitNoteEditMode(note, noteElement, false);
        });

        // Textarea blur handler
        noteElement.querySelector(".dw-note-textarea").addEventListener("blur", () => {
          console.log("EXIT VIA BLUR");
            this.exitNoteEditMode(note, noteElement, true);
        });

        // Close icon click handler
        noteElement.querySelector(".dw-close-icon").addEventListener("click", () => {
            this.removeNoteFromStorage(note);
        });

        // Filename click handler
        noteElement.querySelector(".dw-note-filename").addEventListener("click", () => {
            this.setActiveNote(noteIndex);
            this.openNoteInCurrentTab(noteIndex);
        });

        // collapse / expand
        noteElement.querySelector(".dw-note-collapse").addEventListener("click", (e) => {
          this.toggleNoteCollapse(noteElement);
        });

        this.noteList.appendChild(noteElement);
    });
}

enterNoteEditMode(noteElement) {
    noteElement.classList.add("editing");
    const textArea = noteElement.querySelector(".dw-note-textarea");
    const noteText = noteElement.querySelector(".dw-note-text");

    // Show textarea and hide text
    textArea.style.display = "block";
    noteText.style.display = "none";

    // Focus the textarea for editing
    textArea.focus();
}

exitNoteEditMode(note, noteElement, saveChanges) {
    noteElement.classList.remove("editing");
    const textArea = noteElement.querySelector(".dw-note-textarea");
    const noteText = noteElement.querySelector(".dw-note-text");

    if (saveChanges) {
        const newText = textArea.value.trim();
        noteText.textContent = newText;
        this.updateNoteText(note, newText);
    }

    // Hide textarea and show text
    textArea.style.display = "none";
    noteText.style.display = "block";
}

toggleNoteCollapse(noteElement) {
  const noteText = noteElement.querySelector(".dw-note-text");
  const collapseIcon = noteElement.querySelector(".dw-note-collapse");

  if (noteElement.classList.contains("collapsed")) {
      // Expand note text
      noteElement.classList.remove("collapsed");
      noteText.style.display = "block";
      collapseIcon.innerHTML = this.icons.arrowUpIcon;
  } else {
      // Collapse note text
      noteElement.classList.add("collapsed");
      noteText.style.display = "block";  // Keep it displayed but truncated
      collapseIcon.innerHTML = this.icons.arrowDownIcon;
  }
}

// Update the note text in storage (stub function)
updateNoteText(note, text) {
  //
  // it should trigger notes_${id} update -> and render notes on callback
  //
  note.text = text;
  chrome.runtime.sendMessage({ action: "SnBackground.updateNote", note, snippetId: this.currentSnippetId});
}


  setActiveSnippet(snippetId) {
      chrome.storage.sync.set({ active_snippet: snippetId });
      console.log(`Active snippet set to: ${snippetId}`);
      chrome.runtime.sendMessage({ action: "SnBackground.setActiveSnippet", snippetId }, (response) => {
          if (response.error && response.error != "") {
            // TODO: put some notes to the UI
            console.error("Error sending message:", chrome.runtime.lastError);
          }
      });
  }

  saveSnippet() {
    // This should never happen,
    // UI icons are visible for a while
    if (this.currentSnippetId === null)
      return;
    chrome.tabs.create({ url: `http://localhost:4200/activesnippets/${this.currentSnippetId}` });
  }

  removeSnippet() {
      if (this.currentSnippetId === null) return;

      this.currentSnippetTitle.textContent = "";
      this.mainContainer.classList.add("sn-snippet-mode");
      //
      // UI updata should happen on callbacks
      //
      chrome.runtime.sendMessage({ 
        action: "SnBackground.removeSnippet", 
        snippetId: this.currentSnippetId,
      });
  }

  createNewSnippet() {
      const id = Date.now();
      const newSnippet = {
          id,
          state: "new",
          title: `Snippet ${id}`,
          activeNote: -1,
      };

      chrome.storage.sync.get({ snippets: [] }, (data) => {
          const updatedSnippets = [...data.snippets, newSnippet];
          chrome.storage.sync.set({ snippets: updatedSnippets, [`notes_${id}`]: [], [`active_note_${id}`]: -1 }, () => {
              this.loadSnippet(newSnippet);
              this.renderSnippets();
          });
      });
  }

  handlePrevNote() {
      if (this.activeNote <= 0) {
          this.activeNote = 0;
          return;
      } else {
          this.updateNextPrevDisabledState(this.activeNote, --this.activeNote);
          this.openNoteInCurrentTab(this.activeNote);
      }
  }

  handleNextNote() {
      if (this.activeNote >= this.noteList.childElementCount - 1) {
          return;
      } else {

        if (this.activeNote + 1 < this.noteList.childElementCount) {
          this.updateNextPrevDisabledState(this.activeNote, ++this.activeNote);
          this.openNoteInCurrentTab(this.activeNote);
        }
      }
  }

  openNoteInCurrentTab(noteIndex) {
      const note = this.noteList.children[noteIndex];
      if (note) {
          chrome.storage.sync.set({ [`active_note_${this.currentSnippetId}`]: noteIndex });
          const snData = note.getAttribute("sn-note-url");
          const snText = note.getAttribute("sn-note-text");
          const snId =  parseInt(note.getAttribute("sn-note-id"), 10);
          if (snData) {
              chrome.runtime.sendMessage({
                action: "SnBackground.openNoteInCurrentTab",
                url: snData,
                text: snText,
                noteId: snId,
                snippetId: this.currentSnippetId,
                noteIndex }, (response) => {
                  if (response) console.log(response.message);
              });
          }
      }
  }

  updateNextPrevDisabledState(oldActiveNote, newActiveNote, force = false) {
      if (oldActiveNote === newActiveNote && !force)
        return;

      if (oldActiveNote >= 0 && oldActiveNote < this.noteList.childElementCount) {
          this.noteList.children[oldActiveNote].classList.remove("sn-note-active");
      }
      if (newActiveNote !== undefined && this.noteList.childElementCount > newActiveNote && newActiveNote >= 0) {
        this.noteList.children[newActiveNote].classList.add("sn-note-active");
      }

      document.getElementById("dw-notes-prev").disabled = newActiveNote <= 0;
      document.getElementById("dw-notes-next").disabled =
          (newActiveNote >= 0 && newActiveNote >= this.noteList.childElementCount - 1);
  }

  updateSnippetTitle() {
      chrome.storage.sync.get({ snippets: [] }, (data) => {
          const updatedSnippets = data.snippets.map((s) =>
              s.id === this.currentSnippetId ? { ...s, title: this.currentSnippetTitle.textContent } : s
          );
          chrome.storage.sync.set({ snippets: updatedSnippets }, () => this.renderSnippets());
      });
  }

  removeNoteFromStorage(rmNote) {
    chrome.runtime.sendMessage({ action: "SnBackground.removeNote", note: rmNote, snippetId: this.currentSnippetId});
    /*
      const notes_id = `notes_${this.currentSnippetId}`;
      const active_id = `active_note_${this.currentSnippetId}`;
      chrome.storage.sync.get( { [notes_id] : [], [active_id] : -1 }, (data) => {
          const notes = (data[notes_id] || []).filter((note) => note.id !== rmNote.id);
          const newActiveId = (rmNote.id == data[active_id]) ? -1 : data[active_id];
          chrome.storage.sync.set({ [notes_id]: notes, [active_id]: newActiveId }, () => {
              this.renderNotes(notes);
              this.notifyNoteRemove(rmNote);
          });
      });
    */
  }

  // Helper function to sanitize URLs
  sanitizeUrl(url) {
    try {
      const urlObject = new URL(url);
      return `${urlObject.origin}${urlObject.pathname}`; // Keeps origin and pathname, removes query params and fragments
    } catch (error) {
      console.error("Error sanitizing URL:", error);
      return url; // If URL parsing fails, return the original URL
    }
  }

  notifyNoteRemove(note) {
    const data = {
      action: "onNoteRemove",
      url: note.url,
      nid: note.id,
      sid: this.currentSnippetId
    };
    chrome.runtime.sendMessage({ action: "SnBackground.broadcast", data});
  }

  getFileName(url) {
      return new URL(url).pathname.split("/").pop();
  }

  getRepoName(url) {
      const pathParts = new URL(url).pathname.split("/");
      return `${pathParts[1]}/${pathParts[2]}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new SnippetManager();
});
