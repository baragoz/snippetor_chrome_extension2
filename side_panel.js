// script.js


class TabsDataProvider {

    constructor(observer) {
        this.tabsMap = [];
        this.activeTabId = -1;
        this.activeSnippetId = -1;
        this.pinnedSnippetId = -1;

        // states
        this.stateDefault = "snippets";
        this.statePinned = "default";

        // On state change
        this.observer = observer;

        // init storage data
        this.init();
    }

    init() {
        chrome.storage.sync.get({ active_snippet: -1, tabs_map: [], active_tab_id: -1 }, (data) => {
            // update initial parametes
            this.tabsMap = data.tabs_map;
            this.activeTabId = data.active_tab_id;
            this.activeSnippetId = data.active_snippet;

            //
            // if we have some active snippet, then we should show it
            // on side panel initial state.
            //
            if (this.activeSnippetId > -1) {
              this.stateDefault = "active";
            }

            // Update pinned state, and show pinned tab by default, if it is available
            this.refreshPinnedState();
    
            // notify observer
            this.observer.onDataReady();

            // init data change listener
            this.initListener();

          });
    }

    initListener() {
      // Listen for changes in chrome.storage.sync
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync') {
            let hasStateChange = false;
            for (let key in changes) {
                if (key === 'active_snippet') {
                  //
                  // Open new active snippet
                  //
                  if ((changes[key].newValue >= 0 && changes[key].oldValue < 0)
                    || (changes[key].newValue >= 0 && changes[key].newValue != changes[key].oldValue)) {
                    this.stateDefault = "active"
                  }
                  //
                  // Close active snippet
                  //
                  if (changes[key].newValue < 0 && changes[key].oldValue >= 0) {
                    this.stateDefault = "snippets"
                  }
                  this.activeSnippetId = changes[key].newValue;
                  hasStateChange = true;
                } else if (key == "active_tab_id") {
                  this.activeTabId = changes[key].newValue;
                  this.refreshPinnedState();
                  hasStateChange = true;
                } else if (key == "tabs_map") {
                  // new values for the tabs_map controlled by current ui
                  // just need to update value
                  this.tabsMap = changes[key].newValue;
                  this.refreshPinnedState();
                  hasStateChange = true;
                }
            }
            if (hasStateChange) {
                this.observer.onStateChange();
            }
        }
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
              // it should trigger a snippet load sequence
              this.setActiveSnippet(id);
                // this.loadSnippet(newSnippet);
                // this.renderSnippets();
            });
        });
    }

    setActiveSnippet(snippetId) {
        if (snippetId >= 0) {
          this.statePinned = "default";
        }

        chrome.runtime.sendMessage({ action: "SnBackground.setActiveSnippet", snippetId }, (response) => {
          if (response.error && response.error != "") {
            // TODO: put some notes to the UI
            console.error("Error sending message:", chrome.runtime.lastError);
          }
        });
    }

    refreshPinnedState() {
      let index = this.tabsMap.findIndex(item => item.tabId === this.activeTabId);
      //
      // Set state from the tabs_map if current tab was pinned
      //
      if (index >= 0) {
        this.statePinned = this.tabsMap[index].state;
        this.pinnedSnippetId = this.tabsMap[index].snippetId;
      } else {
        this.statePinned = "default";
        this.pinnedSnippetId = -1;
      }
    }

    //
    //  Update internal state for data provider
    //
    syncSelectedTabState(state) {
        if (state == "pinned") {
          this.statePinned = "pinned";
        } else {
          this.statePinned = "default";
          this.stateDefault = state;
        }

        this.syncPinnedStateWithTabsMap();
    }

    //
    // We need to reload the list of snippet notes for current tab
    // when user switch between active and pinned snippets
    //
    syncPinnedStateWithTabsMap() {
        console.log("UPDATE PINNED STATE 1");
        if (this.pinnedSnippetId < 0) {
            console.log("UPDATE PINNED STATE ex 1");
            // Do nothing, there is no pinned tab
            return;
        }

        let index = this.tabsMap.findIndex(item => item.tabId === this.activeTabId);
        console.log("UPDATE PINNED STATE 2");
        if (index < 0) {
            console.log("UPDATE PINNED STATE ex 2");
            // it should never happen, but let's keep an extra check
            return;
        }

        //
        // Check if we need to update state
        //
        console.log("CAHNGE PINNED TO " + this.statePinned + " OLD STATE IS:" + this.tabsMap[index].state);
        if (this.tabsMap[index].state != this.statePinned) {
            this.tabsMap[index].state = this.statePinned;
            // Update storage with a new state
            chrome.storage.sync.set({ tabs_map: this.tabsMap }, (result) => {
              chrome.runtime.sendMessage({ action: "SnBackground.forceContentDataReload"});
            });
         }
         else {
            console.log("UPDATE PINNED STATE SAME STATE");
         }
    }
}

class TabsManager {
    constructor(snippetManager) {
      this.snippetManager = snippetManager;
      // Elements
      this.menu = document.querySelector("#dw-tab-snippets");
      this.active = document.querySelector("#dw-tab-active");
      this.pinned = document.querySelector("#dw-tab-pinned");

      // Data Provider
      this.dataProvider = new TabsDataProvider(this);

      // subscribe for events
      this.init();
    }

    init() {
        this.menu.addEventListener("click", (evt) => this.handleTabClick("snippets"));
        this.active.addEventListener("click", (evt) => this.handleTabClick("active"));
        this.pinned.addEventListener("click", (evt) => this.handleTabClick("pinned"));

        // Click on active close
        document.querySelector("#dw-tab-close-active").addEventListener("click", (evt) => this.handleCloseActive(evt));
    }

    onDataReady() {
      this.onStateChange();
    }

    //
    //  UI elements handler
    //
    handleTabClick(action, callManager = true) {
        const listOfTabs = [
            this.menu,
            this.active,
            this.pinned,
        ];
        
        // Loop through each tab and update classes
        listOfTabs.forEach((tab) => {
          tab.classList.remove("active");
          tab.classList.add("default");
        });
      
        // TODO: make a map instead { action - element }
        let elem = document.querySelector("#dw-tab-" + action);
        
        // Update the clicked tab's classes
        elem.classList.add("active");
        elem.classList.remove("default");
        // show element again
        elem.style.display = "flex";
      
        let isPinned = (action == "pinned");

        this.snippetManager.showTab(action, {
            snippetId: isPinned ? this.dataProvider.pinnedSnippetId : this.dataProvider.activeSnippetId
        });

        this.dataProvider.syncSelectedTabState(action);

        // false - if we want to chage tab state only
        //if (callManager) {
        //  this.snippetManager.handleTabClick(action);
        //}
    }

    handleCloseActive(evt) {
      // prevent default handler
      evt.preventDefault();
      evt.stopPropagation();

      // hide tab
      this.toggleTab("active", false);

      // unset active snippet
      this.setActiveSnippet(-1);
      return true;
    }

    toggleTab(tabName, showTab = false) {
        if (tabName == "active") {
            this.active.style.display = showTab ? "flex" : "none";
        } else if (tabName == "pinned") {
            this.pinned.style.display = showTab ? "flex" : "none";
        }
    }

    //
    // DATA PROVIDER OBSERVER API
    //
    onStateChange() {
        // Step 1: hide/show active or pinned
        this.toggleTab("active", (this.dataProvider.activeSnippetId >= 0));
        this.toggleTab("pinned", (this.dataProvider.pinnedSnippetId >= 0));
        
        // Step 2: highlight an active tab
        if (this.dataProvider.statePinned == "pinned") {
            this.handleTabClick("pinned", false);
        } else {
            // it could be snippets OR active only
            this.handleTabClick(this.dataProvider.stateDefault, false);
        }
        // Setp 3: trigger the snippet manager update
        
    }

    //
    // PUBLIC snippets API: 
    //
    createNewSnippet() {
        this.dataProvider.createNewSnippet()
    }

    setActiveSnippet(snippetId) {
        // it should trigger onStateChange
        this.dataProvider.setActiveSnippet(snippetId);
    }
};


//
//  Observer: 
//    (+) onNoteChange()
//    (+) onActiveNoteChange()
//
class SnippetDataProvider {
    constructor(observer, isPinned) {
      this.observer = observer;
      this.isPinned = isPinned;

      this.notes = [];
      this.snippetId = -1;
      this.activeNoteId = -1;
      // pinned data
      this.tabsMap = [];
      this.activeTabId = -1;

      this.hasListener = false;
      this.activeNote = -1;
    }

    init(snippetId) {
        this.snippetId = snippetId;
        this.activeNote = -1;

        // Subscribe for 
        const notesUid = `notes_${this.snippetId}`;
        const activeNoteUid = `active_note_${this.snippetId}`;

        chrome.storage.sync.get({[notesUid]: [], [activeNoteUid]: -1, tabs_map: [], active_tab_id: -1 } , (data) => {
          // update data
          this.notes = data[notesUid];
          this.activeNoteId = data[activeNoteUid];
          this.tabsMap = data.tabs_map;
          this.activeTabId = data.active_tab_id;

          // need to calculate an active note
          this.checkActiveNoteChange();

          // notify observer
          this.observer.onDataReady();

          // init data change listener
          this.initListener();
       });
    }

    checkActiveNoteChange(shouldNotify = false) {
        let newNote = -1;
        if (this.isPinned) {
          let index = this.tabsMap.findIndex(item => item.tabId === this.activeTabId);
          if (index >= 0 && this.tabsMap[index].snippetId == this.snippetId) {
            newNote = this.tabsMap[index].activeNote;
          }
        } else {
          newNote = this.activeNoteId;
        }
        //
        // Update if new note id is different from current note id
        if (newNote != this.activeNote || shouldNotify) {
          this.observer.onActiveNoteChange(this.activeNote, newNote);
          this.activeNote = newNote;
        }
    }

    getActiveNote() {
        return this.activeNote;
    }

    reset() {
        this.snippetId = -1;
        this.notes = []
        this.activeNote = -1;
        this.activeNoteId = -1;
        // Do not need to unsubscribe from the listener
    }

    initListener() {
        // subscribe only once
        if (this.hasListener)
          return;
        this.hasListener = true;

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'sync' && this.snippetId >= 0) {
                let hasStateChange = false;
                for (let key in changes) {
                    if (key == `notes_${this.snippetId}`) {
                      this.notes = (changes[key].newValue != undefined) ? changes[key].newValue  : [];
                      this.observer.onNotesChange();
                    } else if (key == `active_note_${this.snippetId}`) {
                      this.activeNoteId = (changes[key].newValue != undefined) ? changes[key].newValue  : -1;
                      hasStateChange = true;  
                    } else if (key == "active_tab_id") {
                      this.activeTabId = (changes[key].newValue != undefined) ? changes[key].newValue  : -1;
                      hasStateChange = true;
                    } else if (key == "tabs_map") {
                      this.tabsMap = (changes[key].newValue != undefined) ? changes[key].newValue  : [];
                      hasStateChange = true;
                    }
                }
                if (hasStateChange) {
                    this.checkActiveNoteChange(true);
                }
            }
        });
    }

    handlePinCurrentTab() {
      //
      // Pinned tab opened
      //
      if (this.isPinned) {
        chrome.runtime.sendMessage({ action: "SnBackground.unpinCurrentTab"}, (result) => {
            chrome.runtime.sendMessage({ action: "SnBackground.forceContentDataReload"});
        });
        return;
      }

      console.log("PINN CURRENT TAB ", this.snippetId);
      if (this.snippetId >= 0) {
        //
        // Assign current snippet to tab
        //
        chrome.runtime.sendMessage({
          action: "SnBackground.pinCurrentTab",
          snippetId: this.snippetId,
          activeNote: this.activeNote }, (data) => {
        });
      }
    }


    saveSnippet() {
    // This should never happen,
    if (this.snippetId < 0)
      return;

    // just force to open website at current snippet id
    chrome.tabs.create({ url: `http://localhost:4200/activesnippets/${this.snippetId}` });
    }

    removeSnippet() {
    // This should never happen
    if (this.snippetId < 0)
      return;

      //
      // UI updata should happen on callbacks
      //
      chrome.runtime.sendMessage({ 
        action: "SnBackground.removeSnippet", 
        snippetId: this.snippetId,
      });
    }

    removeNoteFromStorage(rmNote) {
      chrome.runtime.sendMessage({ action: "SnBackground.removeNote", note: rmNote, snippetId: this.snippetId});
    }

    openNoteInCurrentTab(noteIndex) {
      if (noteIndex < 0 || noteIndex >= this.notes.length) {
        return;
      }
      let note = this.notes[noteIndex];
      chrome.runtime.sendMessage({
        action: "SnBackground.openNoteInCurrentTab",
        url: note.url,
        text: note.title,
        noteId: note.id,
        snippetId: this.snippetId,
        noteIndex }, (response) => {
          if (response) console.log(response.message);
      });
    }

    //
    // Update an active note index
    //
    updateActiveNoteIndex(noteIndex, openUrl = false) {
        if (this.snippetId < 0) {
          return;
        }
  
        if (this.isPinned) {
          // Update tabs_map
          chrome.runtime.sendMessage({
            action: "SnBackground.updateActiveNoteForPinnedTab",
            activeNote: noteIndex,
            snippetId: this.snippetId
          });
        } else {
          // Update an active not id
          const activeNoteUid = `active_note_${this.snippetId}`;
          chrome.storage.sync.set({ [activeNoteUid]: noteIndex });
        }

        if (openUrl) {
          this.openNoteInCurrentTab(noteIndex);
        }
    }

    updateNoteText(note) {
        //
        // it should trigger notes_${id} update -> and render notes on callback
        //
        chrome.runtime.sendMessage({ action: "SnBackground.updateNote", note, snippetId: this.snippetId});
    }

    saveActiveNote(activeNote) {
        if (this.snippetId < 0) {
            return;
          }
  
        if (this.isPinned) {
            chrome.runtime.sendMessage({
                action: "SnBackground.updateActiveNoteForPinnedTab",
                activeNote: activeNote,
                snippetId: this.snippetId
              });    
        } else {
            const activeNoteUid = `active_note_${this.snippetId}`;
            chrome.storage.sync.set({ [activeNoteUid]: activeNote });
        }
    }
}

//
//  SnippetView consists of:
//  - Toolbar
//  - NotesView
//  - Next-Prev buttons
//
class SnippetView {
    constructor(elementId, snippetId, isPinned, tabsManager) {
      this.container = document.getElementById(elementId);
      this.snippetId = snippetId;
      this.isPinned = isPinned;

      // parent element
      this.tabsManager = tabsManager;

      // Create ui stubs
      this.create();

      // Data provider
      this.dataProvider = new SnippetDataProvider(this, isPinned);

      // Views
      this.toolbarView = new ToolbarView(this.container, isPinned, this);

      // this.onNoteSelect
      this.notesView = new NotesView(this.container, this.dataProvider);

      this.init();
    }

    create() {
        this.container.innerHTML = `
          <div id="dw-toolbar-icons">
          </div>
          <div id="dw-snippet-controls">
            <span id="dw-current-snippet-title" title="Edit snippet title">Snippet title</span>
          </div>
          <div id="dw-branch-toggle">
            <div id="dw-button-group" class="sn-btn-group">
              <button class="sn-btn sn-btn-primary active" title="Fixed revision">Blob</button>
              <button class="sn-btn sn-btn-primary" title="Default branch&#10;Latest Revision">Master</button>
            </div>
          </div>
          <div id="dw-note-list"></div>
          <div class="sn-divider"></div>
          <!-- Navigation Buttons -->
          <div id="dw-navigation-buttons">
            <button id="dw-notes-prev" class="sn-button">Prev</button>
            <button id="dw-notes-next" class="sn-button">Next</button>
          </div>
        `;
    }

    //
    // Subscribe for listeners
    //
    init() {
      // Snippet title edit
      this.currentSnippetTitle = this.container.querySelector("#dw-current-snippet-title");
      this.currentSnippetTitle.contentEditable = true;
      this.currentSnippetTitle.textContent = "SOMEHGNASD ";
      this.currentSnippetTitle.addEventListener("blur", () => this.updateSnippetTitle());

      // bottom - next/prev snippet
      this.container.querySelector("#dw-notes-prev").addEventListener("click", () => this.handlePrevNote());
      this.container.querySelector("#dw-notes-next").addEventListener("click", () => this.handleNextNote());
    }

    show() {
      this.container.classList.add("sn-show-view");
    }
    
    hide() {
      this.container.classList.remove("sn-show-view");
    }

    //
    // There are 3 reasons to call this method:
    // 1. title change
    // 2. snippet change
    // 3. active note change
    //
    loadSnippet(title, snippetId) {
      this.snippetId = snippetId;

      this.currentSnippetTitle.contentEditable = title != null;
      this.currentSnippetTitle.textContent = title || "Error: Failed to get a snippet title.";
      
      //
      // Note: no need to re-draw snippet if it is the same snippet
      //
      if (this.dataProvider.snippetId != snippetId) {
        if (snippetId < 0) {
            this.dataProvider.reset();
        } else {
            this.dataProvider.init(snippetId);
        }
      }
    }

    //
    // DATA PROVIDER OBSERVER API
    //
    onActiveNoteChange(oldVal, newVal) {
        // highlight new value
        this.notesView.highlightActiveNote(newVal);
        // Update next/prev button
        this.updateNextPrevDisabledState(newVal);
    }

    onDataReady() {
      this.onNotesChange();
    }

    onNotesChange() {
      // It is easier to re-draw an entire list
      this.notesView.init(this.snippetId, this.dataProvider.notes);
      this.updateNextPrevDisabledState(this.dataProvider.getActiveNote());
    }

    //
    //  HEADER:  update title
    //
    updateSnippetTitle() {
        //
        // TODO: it should be managed by TabsDataProvider
        //
        chrome.storage.sync.get({ snippets: [] }, (data) => {
            const updatedSnippets = data.snippets.map((s) =>
                s.id === this.snippetId ? { ...s, title: this.currentSnippetTitle.textContent } : s
            );
              // it shoult trigget title update in a snippets list
            chrome.storage.sync.set({ snippets: updatedSnippets });
        });
    }

    //
    // BOTTOM:  Next-Prev navigation
    // 
    handlePrevNote() {
      let activeNote = this.dataProvider.getActiveNote();
      if (activeNote <= 0) {
        return;
      } else {
        this.dataProvider.saveActiveNote(activeNote - 1);
        this.dataProvider.openNoteInCurrentTab(activeNote - 1);
      }
    }
  
    handleNextNote() {
        let activeNote = this.dataProvider.getActiveNote();
        if (activeNote >= this.dataProvider.notes.length - 1) {
            return;
        } else {
          if (activeNote + 1 < this.dataProvider.notes.length) {
            this.dataProvider.saveActiveNote(activeNote + 1);
            this.dataProvider.openNoteInCurrentTab(activeNote + 1);
          }
        }
    }

    updateNextPrevDisabledState(newActiveNote) {
        this.container.querySelector("#dw-notes-prev").disabled = newActiveNote <= 0;
        this.container.querySelector("#dw-notes-next").disabled = (newActiveNote < 0)
          || (newActiveNote >= this.dataProvider.notes.length - 1);
    }

    //
    // TODO: move to data provider api, because of chrome-calls
    //       and we do need to update active note too
    //
    openNoteInCurrentTab(noteIndex) {
        // const note = this.dataProvider.notes[noteIndex];
        this.dataProvider.updateActiveNoteIndex(noteIndex, true);
            /*        
        if (note) {
            chrome.storage.sync.set({ [`active_note_${this.snippetId}`]: noteIndex });

            const snData = note.getAttribute("sn-note-url");
            const snText = note.getAttribute("sn-note-text");
            const snId =  parseInt(note.getAttribute("sn-note-id"), 10);
            if (snData) {
              //
              // Update tabsMap with a new activeNote position,
              // and request url load after that
              //
              if (this.statePinned == "pinned") {
                this.activeNote = noteIndex;
                this.updatePinnedStateForCurrentTab(this.statePinned);
              }
              
              //
              // noteId - is note unique id, which uses when new url is the same url
              //          or same url + #hash
              //
              chrome.runtime.sendMessage({
                action: "SnBackground.openNoteInCurrentTab",
                url: note.url,
                text: note.title,
                noteId: note.id,
                snippetId: this.snippetId,
                noteIndex }, (response) => {
                  if (response) console.log(response.message);
              });
            // }
        }
            */
    }

    handlePinCurrentTab() {
        //
        // TODO: Ugly hack. need to re-work
        //
        this.dataProvider.handlePinCurrentTab();
    }
  
}

class ToolbarView {
  constructor(snippetContainer, isPinned, snippetView) {
    this.isPinned = isPinned;
    this.snippetView = snippetView;
    console.log("SNIPPET CONTAINER IS :", snippetContainer);
    this.container = snippetContainer.querySelector("#dw-toolbar-icons");

    // Create toolbar
    this.create();

    // init actions
    this.init();
  }

  create() {
    this.container.innerHTML = `
        <div id="dw-icon-space" class="sn-icon-space">
          <div id="dw-pin-current-tab">
            <div class="sn-unpinned-icon">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
                <title>Pin snippet to current tab</title>
                <path d="M640-480l80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280ZM480-400h126l-46-46v-314H400v314l-46 46h126Z" />
              </svg>
            </div>
            <div class="sn-pinned-icon">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
                <title>Un-pin snippet from current tab</title>
                <path d="M640-480l80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280ZM400-680h160v280H400v-280Z"/>
              </svg>
            </div>
          </div>
          <div id="dw-show-tabs">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
              <title>[Next Release] Show all pinned tabs</title>
              <path
                d="M320-240q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-320H520v-160H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z" />
            </svg>
          </div>
        </div>

        <div class="sn-right-side-buttons">
          <button id="dw-download-snippet" title="[Next Release] Download as JSON" class="sn-button">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
              <path
                d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z" />
            </svg>
          </button>
          <button id="dw-save-snippet" title="Go to save page" class="sn-button">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
              <path
                d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v640q0 33-23.5 56.5T720-80H240Zm0-80h480v-640h-80v280l-100-60-100 60v-280H240v640Zm0 0v-640 640Zm200-360 100-60 100 60-100-60-100 60Z" />
            </svg></button>
          <button id="dw-remove-snippet" title="Remove local changes" class="sn-button"><svg
              xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
              <path
                d="m376-300 104-104 104 104 56-56-104-104 104-104-56-56-104 104-104-104-56 56 104 104-104 104 56 56Zm-96 180q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520Zm-400 0v520-520Z" />
            </svg>
          </button>
        </div>
      </div>
    `
  }

  init() {
    //
    // Note: No need to make a complex HTML template,
    //       it is easier to add class at this point
    //
    if (this.isPinned)
      this.container.querySelector("#dw-pin-current-tab").classList.add("sn-pinned-state");

    this.tabsContainer = document.getElementById("dw-tab-list");
    //
    // Find elements by id in scope of this.container
    //
    this.container.querySelector("#dw-pin-current-tab").addEventListener("click", () => this.handlePinCurrentTab());
    this.container.querySelector("#dw-show-tabs").addEventListener("click", () => this.toggleShowTabs());
    this.container.querySelector("#dw-save-snippet").addEventListener("click", () => this.saveSnippet());
    this.container.querySelector("#dw-remove-snippet").addEventListener("click", () => this.removeSnippet());
  }

  handlePinCurrentTab() {
    // data provider has an information about current snippet id and active note
    this.snippetView.handlePinCurrentTab(this.isPinned);
  }

  toggleShowTabs(forceShow) {
    var shouldShow = forceShow;
    if (forceShow === undefined) {
      shouldShow = !this.tabsContainer.classList.contains("sn-show-tabs");
    } 

    if (shouldShow) {
      this.tabsContainer.classList.add("sn-show-tabs");
    } else {
      this.tabsContainer.classList.remove("sn-show-tabs");
    }
  }

  saveSnippet() {
    this.snippetView.dataProvider.saveSnippet();
  }

  removeSnippet() {
    this.snippetView.dataProvider.removeSnippet();
  }
}


class NotesView {
    constructor(snippetContainer, snippetDataProvider) {
      this.container = snippetContainer.querySelector("#dw-note-list");
      this.snippetDataProvider = snippetDataProvider;
      this.notes = [];
      this.icons = {
        // Edit note
        editIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M160-120v-170l527-526q12-12 27-18t30-6q16 0 30.5 6t25.5 18l56 56q12 11 18 25.5t6 30.5q0 15-6 30t-18 27L330-120H160Zm80-80h56l393-392-28-29-29-28-392 393v56Zm560-503-57-57 57 57Zm-139 82-29-28 57 57-28-29ZM560-120q74 0 137-37t63-103q0-36-19-62t-51-45l-59 59q23 10 36 22t13 26q0 23-36.5 41.5T560-200q-17 0-28.5 11.5T520-160q0 17 11.5 28.5T560-120ZM183-426l60-60q-20-8-31.5-16.5T200-520q0-12 18-24t76-37q88-38 117-69t29-70q0-55-44-87.5T280-840q-45 0-80.5 16T145-785q-11 13-9 29t15 26q13 11 29 9t27-13q14-14 31-20t42-6q41 0 60.5 12t19.5 28q0 14-17.5 25.5T262-654q-80 35-111 63.5T120-520q0 32 17 54.5t46 39.5Z"/></svg>',
        cancelIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fefefe"><path d="m336-280 144-144 144 144 56-56-144-144 144-144-56-56-144 144-144-144-56 56 144 144-144 144 56 56ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>',
        doneIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fefefe"><path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>',
        // Collapse note
        arrowDownIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/></svg>',
        arrowUpIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>',
      };
    }

    init(snippetId, notes) {
        // TODO: Do we need to cache the state ?
        this.notes = notes;
        this.container.innerHTML = "";
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
                this.handleNoteRemove(note);
            });
    
            // Filename click handler
            noteElement.querySelector(".dw-note-filename").addEventListener("click", () => {
                this.setActiveNote(noteIndex);
            });
    
            // collapse / expand
            noteElement.querySelector(".dw-note-collapse").addEventListener("click", (e) => {
              this.toggleNoteCollapse(noteElement);
            });
    
            this.container.appendChild(noteElement);
        });

        // we need to highlight an active note on start
        this.highlightActiveNote(this.snippetDataProvider.getActiveNote(), true);
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

    handleNoteRemove(rmNote) {
      this.snippetDataProvider.removeNoteFromStorage(rmNote)
    }
    
    updateNoteText(note, text) {
        //
        // it should trigger notes_${id} update -> and render notes on callback
        //
        note.text = text;
        this.snippetDataProvider.updateNoteText(note);
    }

    setActiveNote(noteIndex) {
      //
      // Save state and open url in current tab
      //
      this.snippetDataProvider.saveActiveNote(noteIndex);

      //
      // force to open url
      //
      this.snippetDataProvider.openNoteInCurrentTab(noteIndex);

      // Highlight note should automatically happen on onActiveNoteChange callback
    }

    highlightActiveNote(noteIndex, force = false) {
      // set all notes as non-active except active note
      Array.from(this.container.children).forEach((child, index) => {
        if (index == noteIndex) {
            child.classList.add('sn-note-active');
        } else {
            child.classList.remove('sn-note-active');
        }
      });
    }

    //
    // TODO: Move to util methods
    //
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

    getFileName(url) {
      return new URL(url).pathname.split("/").pop();
    }

    getRepoName(url) {
      const pathParts = new URL(url).pathname.split("/");
      return `${pathParts[1]}/${pathParts[2]}`;
    }
}

class SnippetsListDataProvider {
    constructor(observer) {
        this.observer = observer;
        this.snippets = [];

        // init storage data
        this.init();
    }

    init() {
        chrome.storage.sync.get({ snippets: [] }, (data) => {
            // update initial parametes
            this.snippets = data.snippets;

            // notify observer
            this.observer.onDataReady();

            // init data change listener
            this.initListener();
          });
    }

    initListener() {
      // Listen for changes in chrome.storage.sync
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync') {
            for (let key in changes) {
                //
                // Polling only list of snippets change
                //
                if (key === 'snippets') {
                  this.snippets = changes[key].newValue;
                  this.observer.onStateChange();
                }
            }
        }
      });
    }

    getSnippetTitle(snippetId) {
        let snips = this.snippets.filter(item => item.id === snippetId);
        if (snips.length > 0) {
            return snips[0].title;
        }
        return null;
    }
}

class SnippetsListView {
    constructor(elementId, tabsManager) {
        this.container = document.getElementById(elementId);
        this.listElement = document.querySelector("#dw-new-snippet-list");
        //
        // API to create a new snippet or open selected snippet in an active tab
        //
        this.tabsManager = tabsManager;

        this.icons = {
            // snippet state
            new: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M280-160v-441q0-33 24-56t57-23h439q33 0 56.5 23.5T880-600v320L680-80H360q-33 0-56.5-23.5T280-160ZM81-710q-6-33 13-59.5t52-32.5l434-77q33-6 59.5 13t32.5 52l10 54h-82l-7-40-433 77 40 226v279q-16-9-27.5-24T158-276L81-710Zm279 110v440h280l160-160v-280H360Zm220 220Zm-40 160h80v-120h120v-80H620v-120h-80v120H420v80h120v120Z"/></svg>`,
            play: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/></svg>`,
        };

        this.dataProvider = new SnippetsListDataProvider(this);

        this.init();
    }

    init() {
      //
      //  Save snippet on a website
      //
      document.getElementById("dw-open-snippet-search").addEventListener("click", (e) => {
        chrome.tabs.create({ url: `https://snippetor.com/search` });
      });
      
      //
      //  Crate a new snippet
      //
      document.getElementById("dw-new-snippet").addEventListener("click", (e) => {
        e.preventDefault();
        // Tab manager should handle snippets creation
        this.tabsManager.createNewSnippet();
      });
    }

    show() {
        this.container.classList.add("sn-show-view");
    }
    hide() {
        this.container.classList.remove("sn-show-view");
    }

    onDataReady() {
      this.uiUpdateSnippetList(this.dataProvider.snippets);
    }

    onStateChange() {
      this.uiUpdateSnippetList(this.dataProvider.snippets);
    }

    uiUpdateSnippetList(snippets) {
        // Erase the previous state
        this.listElement.innerHTML = "";
        // Add new element
        snippets.forEach((snippet) => {
            const snippetElement = document.createElement("div");
            snippetElement.innerHTML = `
                <a class='sn-button sn-recent-snippet' href='#'>${snippet.state === "new" ? this.icons.new : this.icons.play}&nbsp;${snippet.title}</a>`;
            snippetElement.dataset.id = snippet.id;
    
            snippetElement.addEventListener("click", () => {
                //this.loadSnippet(snippet);
                this.tabsManager.setActiveSnippet(snippet.id);
            });
    
            this.listElement.appendChild(snippetElement);
        });
      }
    
      _getSnippetById(snippets, uid) {
        let result = null;
        snippets.forEach((snippet) => {
            if (snippet.id == uid)
              result = snippet;
        });
        return result;
      }
}

class SnippetManager {
  constructor() {
      // List of pinned tabs
      // this.tabsContainer = document.getElementById("dw-tab-list");
      // Snippet container
      this.mainContainer = document.getElementById("dw-main-container");
      // Snippets list container
      this.mainSnippetList = document.getElementById("dw-snippet-list-wrapper");

      // Placeholder for a snippet notes
      // this.noteList = document.getElementById("dw-note-list");
      // Editable title area
      // this.currentSnippetTitle = document.getElementById("dw-current-snippet-title");

      // Current snippet and note ids
      // this.activeSnippetId = -1;
      // this.currentSnippetId = -1;
      // this.pinnedSnippetId = -1;
      // this.activeNote = -1;

      // List of pinned tabs and pinned tab id
      // this.tabsMap = [];
      // this.pinnedTabId = -1;

      // States:
      // this.stateDefault = "snippets";  // could be snippets/active
      // this.statePinned = "default";  // could be pinned/default
/*
      this.icons = {
          // snippet state
          new: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M280-160v-441q0-33 24-56t57-23h439q33 0 56.5 23.5T880-600v320L680-80H360q-33 0-56.5-23.5T280-160ZM81-710q-6-33 13-59.5t52-32.5l434-77q33-6 59.5 13t32.5 52l10 54h-82l-7-40-433 77 40 226v279q-16-9-27.5-24T158-276L81-710Zm279 110v440h280l160-160v-280H360Zm220 220Zm-40 160h80v-120h120v-80H620v-120h-80v120H420v80h120v120Z"/></svg>`,
          play: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/></svg>`,
          // Edit note
          editIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M160-120v-170l527-526q12-12 27-18t30-6q16 0 30.5 6t25.5 18l56 56q12 11 18 25.5t6 30.5q0 15-6 30t-18 27L330-120H160Zm80-80h56l393-392-28-29-29-28-392 393v56Zm560-503-57-57 57 57Zm-139 82-29-28 57 57-28-29ZM560-120q74 0 137-37t63-103q0-36-19-62t-51-45l-59 59q23 10 36 22t13 26q0 23-36.5 41.5T560-200q-17 0-28.5 11.5T520-160q0 17 11.5 28.5T560-120ZM183-426l60-60q-20-8-31.5-16.5T200-520q0-12 18-24t76-37q88-38 117-69t29-70q0-55-44-87.5T280-840q-45 0-80.5 16T145-785q-11 13-9 29t15 26q13 11 29 9t27-13q14-14 31-20t42-6q41 0 60.5 12t19.5 28q0 14-17.5 25.5T262-654q-80 35-111 63.5T120-520q0 32 17 54.5t46 39.5Z"/></svg>',
          cancelIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fefefe"><path d="m336-280 144-144 144 144 56-56-144-144 144-144-56-56-144 144-144-144-56 56 144 144-144 144 56 56ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>',
          doneIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fefefe"><path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>',
          // Collapse note
          arrowDownIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/></svg>',
          arrowUpIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>',
      };
*/
      // create tabs manager
      this.tabsManager = new TabsManager(this);
      this.snippetsView = new SnippetsListView("dw-snippet-list", this.tabsManager);
      this.activeView = new SnippetView("dw-active-view", -1, false, this.tabsManager);
      this.pinnedView = new SnippetView("dw-pinned-view", -1, true, this.tabsManager);

      // Subscribe for UI events
      this.init();
  }

  init() {
      // Snippet toolbar - save/remove buttons
      //document.getElementById("dw-pin-current-tab").addEventListener("click", () => this.handlePinCurrentTab());
      //document.getElementById("dw-show-tabs").addEventListener("click", () => this.toggleShowTabs());
      //document.getElementById("dw-save-snippet").addEventListener("click", () => this.saveSnippet());
      //document.getElementById("dw-remove-snippet").addEventListener("click", () => this.removeSnippet());

      // bottom - next/prev snippet
      //document.getElementById("dw-notes-prev").addEventListener("click", () => this.handlePrevNote());
      //document.getElementById("dw-notes-next").addEventListener("click", () => this.handleNextNote());

      
      // Snippet title edit
      // this.currentSnippetTitle.addEventListener("blur", () => this.updateSnippetTitle());

      /*
      chrome.storage.sync.get({ active_snippet: -1, tabs_map: [], active_tab_id: -1 }, (data) => {
        // update initial parametes
        this.tabsMap = data.tabs_map;
        this.activeTabId = data.active_tab_id;
        this.activeSnippetId = data.active_snippet;
        //
        // if we have some active snippet, then we should show it
        // on side panel initial state.
        //
        if (this.activeSnippetId > -1) {
          this.stateDefault = "active";
        }

        // ui should be updated
        this.uiHandleStateUpdate();
      });
      */


      // Render initial snippets
      // this.renderSnippets();

      // Subscribe on storage data change
      // this.initStorageChangeListener();
  }

  showTab(tabName, data) {
    // hide all views
    this.snippetsView.hide();
    this.activeView.hide();
    this.pinnedView.hide();

    // and now show an active view
    if (tabName == "snippets") {
        this.snippetsView.show();
    } else if (tabName == "active") {
        if (data != undefined) {
          // TODO: need another approach
          let title = this.snippetsView.dataProvider.getSnippetTitle(data.snippetId);
          this.activeView.loadSnippet(title, data.snippetId, data.activeNote);
        }
        this.activeView.show();
    } else if (tabName == "pinned") {
        console.log("SHOW PINNED TAB !!!", data);
        if (data != undefined) {
          // TODO: need another approach
          let title = this.snippetsView.dataProvider.getSnippetTitle(data.snippetId);
          this.pinnedView.loadSnippet(title, data.snippetId, data.activeNote);
        }
        this.pinnedView.show();
    }
  }

  /*
  handleTabClick(action) {
    if (action == "pinned") {
        this.statePinned = "pinned";
    } else {
        this.statePinned = "default";
        this.stateDefault = action;
    }
    // Save a new state for tab <-> snippet mapping for current tab
    this.updatePinnedStateForCurrentTab(this.statePinned);

    // update UI part now
    this.uiHandleStateUpdate();
  }

  toggleShowTabs(forceShow) {
    var shouldShow = forceShow;
    if (forceShow === undefined) {
      shouldShow = !this.tabsContainer.classList.contains("sn-show-tabs");
    } 

    if (shouldShow) {
      this.tabsContainer.classList.add("sn-show-tabs");
    } else {
      this.tabsContainer.classList.remove("sn-show-tabs");
    }
  }
  

  initStorageChangeListener() {
      // Listen for changes in chrome.storage.sync
      chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'sync') {
              for (let key in changes) {
                  if (key === 'snippets') {
                    // ui - re-draw the list for snippets
                    this.renderSnippets();
                  } else if (key === 'active_snippet') {
                    //
                    // Note: active_snippet  value > 0 could be assigned
                    //       from this panel only BUT
                    //       the following code should happen on value = -1
                    //       when user save or remove snippet via command
                    //       from the website
                    const newSnippetId = changes[key].newValue;
                     if (newSnippetId !== this.activeSnippetId) {
                        // active snippet was open or active was closed
                        // or another active snippet was opened
                        this.stateDefault = (newSnippetId == -1) ? "snippets" : "active";
                        this.activeSnippetId = newSnippetId;
                        this.uiHandleStateUpdate();
                        //this.loadSnippetById(newSnippetId);
                    } else {
                        alert("SAME ACTIVE SNIPPET");
                    }
                  } else if (key == `notes_${this.currentSnippetId}`) {
                    // Note: we have only one list visible, and it is currentSnippetId
                    //       no need to sync 2 lists (active and pinned)
                    //
                    // the list of snippet notes was updated, sync ui
                    //
                    this.renderNotes(changes[key].newValue || []);
                    //
                    // highlight an active note id
                    //
                    this.highlightActiveNote(this.activeNote, true);
                  } else if (key == `active_note_${this.currentSnippetId}`) {
                    console.log("GOT ACTIVE NOTE CHANGE : ", changes[key]);
                    //
                    // TODO: move this value to the tabs_map with tabId == 0
                    //
                    if (!this.isPinnedState())
                      this.highlightActiveNote(changes[key].newValue);
                  } else if (key == "active_tab_id") {
                    this.setActiveTabId(changes[key].newValue);
                  } else if (key == "tabs_map") {
                    // new values for the tabs_map controlled by current ui
                    // just need to update value
                    this.tabsMap = changes[key].newValue;
                  }
              }
          }
      });
  }

  setActiveTabId(tabId) {
    if (this.activeTabId == tabId) {
        return;
    }

    this.activeTabId = tabId;

    this.uiHandleStateUpdate();
  }
    

  enableSnippetsMode(enable) {
    if (enable) {
        this.mainContainer.classList.add("sn-snippet-mode");
    }
    else {
        this.mainContainer.classList.remove("sn-snippet-mode");
    }
  }
    */

  uiHandleStateUpdate() {
    // Step 1: Try to find a state for tab:
    let tabs = this.tabsMap.filter(item => item.tabId === this.activeTabId);

    // Step 2: Show or hide pinned tab:
    this.tabsManager.toggleTab("pinned", tabs.length > 0);

    // Step 2: Show/hide an active tab
    this.tabsManager.toggleTab("active", this.activeSnippetId > -1);

    // Step 3: Has pinned tab? => Load pinned
    if (tabs.length > 0) {
        let active = tabs[tabs.length - 1];
        //
        // TODO: bind pinned state to the tabs_map with active note id
        //
        this.pinnedSnippetId = active.snippetId;
        if (active.state == "pinned") { //  && this.statePinned == "pinned"
            this.enableSnippetsMode(false);
            this.statePinned = "pinned";
            this.tabsManager.handleTabClick("pinned", false);
            this.loadSnippetById(active.snippetId);
            // Update toolbar
            // this.uiUpdateToolbarState();
            return;
        }
    } else {
        // Uses to show pinned/unpinned state for the active tab
        this.pinnedSnippetId = -1;
    }

    // Step 4: No pinned tab OR pinned tab in a switched state
    this.statePinned = "default";


    // Step 5: Check active snippet id
    if (this.activeSnippetId < 0) {
        this.stateDefault = "snippets";
    }

    // Step 6: Check for a default state:
    if (this.stateDefault == "snippets") {
      this.enableSnippetsMode(true);
      this.tabsManager.handleTabClick("snippets", false);
    } else {
        this.enableSnippetsMode(false);
        if (this.activeSnippetId != this.currentSnippetId) {
            this.loadSnippetById(this.activeSnippetId);
        }
    }

    // Highlight snippets OR active tab, but not a pinned
    this.tabsManager.handleTabClick(this.stateDefault, false);
    // this.uiUpdateToolbarState();
  }

  uiUpdateToolbarState() {
    if (this.isPinnedState()) {
      // Add class pinned 
      document.getElementById("dw-pin-current-tab").classList.add("sn-pinned-state");
    } else {
      document.getElementById("dw-pin-current-tab").classList.remove("sn-pinned-state");
    }
  }

  //
  // Just update UI elements:
  // -- add/remove class for active note
  // -- update next/prev elements
  //
  // params:
  // force - force update, because whole list was reloaded
  //
  highlightActiveNote(idx, force = false) {
    if (idx < 0 || idx === undefined)
      return;
    // this method does not update active note value
    this.updateNextPrevDisabledState(this.activeNote, idx, force);
    // that's why I need to update it here:
    this.activeNote = idx;

  }

  _getSnippetToLoad() {
    let tabs = this.tabsMap.filter(item => item.tabId === this.activeTabId);
    if (tabs.length > 0) {
        let active = tabs[tabs.length - 1];
        if (active.state == "pinned") {
            this.statePinned = "pinned";
            return active.snippetId;
        }
        
    } 

    // do not show pinned, it is not available
    this.statePinned = "default";
    return this.activeSnippetId;
  }

  renderSnippets() {
      chrome.storage.sync.get({ snippets: [], active_snippet: -1}, (data) => {
        // Update the list of snippets
        this.uiUpdateSnippetList(data.snippets);

        // No need to update, but ...
        // this.activeSnippetId = data.active_snippet;
      });
  }

  loadSnippet(snippet) {
      // currentSnippetId - part of the note change subscription filter
      this.currentSnippetId = snippet.id;
      this.activeNote = -1;

//    now we have an active snippet and pinned
//    this.setActiveSnippet(this.currentSnippetId);

      this.currentSnippetTitle.contentEditable = true;
      this.currentSnippetTitle.textContent = snippet.title;

      this.mainContainer.classList.remove("sn-snippet-mode");

      const notesUid = `notes_${this.currentSnippetId}`;
      const activeNoteUid = `active_note_${this.currentSnippetId}`;
      chrome.storage.sync.get({[notesUid]: [], [activeNoteUid]: -1 } , (data) => {
        // render notes
        this.renderNotes(data[notesUid] || []);

        // Hightlight an active note (no url loading)
        if (this.isPinnedState()) {
            this.highlightActiveNote(this.getPinnedNoteIndex());
        } else {
            this.highlightActiveNote(data[activeNoteUid]);
        }
        
      });

      // Toolbar is snippet specific
      this.uiUpdateToolbarState();
  }

  loadSnippetById(snippetId) {
      chrome.storage.sync.get({ snippets: [] }, (data) => {
          const snippet = data.snippets.find(s => s.id === snippetId);
          if (snippet) {
            this.loadSnippet(snippet);
          } else {
            alert("SOMETHING WENT WRONG: Failed to find snippet with by ID");
          }
      });
  }



// Update the note text in storage (stub function)
updateNoteText(note, text) {
  //
  // it should trigger notes_${id} update -> and render notes on callback
  //
  note.text = text;
  chrome.runtime.sendMessage({ action: "SnBackground.updateNote", note, snippetId: this.currentSnippetId});
}


  
/*
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
            //
            // Update tabsMap with a new activeNote position,
            // and request url load after that
            //
            if (this.statePinned == "pinned") {
              this.activeNote = noteIndex;
              this.updatePinnedStateForCurrentTab(this.statePinned);
            }
            
            //
            // noteId - is note unique id, which uses when new url is the same url
            //          or same url + #hash
            //
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

          // it shoult trigget title update in a snippets list
          chrome.storage.sync.set({ snippets: updatedSnippets }); //, () => this.renderSnippets());
      });
  }

            */

}


document.addEventListener("DOMContentLoaded", () => {
  new SnippetManager();
});
