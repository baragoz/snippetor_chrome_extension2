let strings = {
  editIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fefef8"><path d="M160-120v-170l527-526q12-12 27-18t30-6q16 0 30.5 6t25.5 18l56 56q12 11 18 25.5t6 30.5q0 15-6 30t-18 27L330-120H160Zm80-80h56l393-392-28-29-29-28-392 393v56Zm560-503-57-57 57 57Zm-139 82-29-28 57 57-28-29ZM560-120q74 0 137-37t63-103q0-36-19-62t-51-45l-59 59q23 10 36 22t13 26q0 23-36.5 41.5T560-200q-17 0-28.5 11.5T520-160q0 17 11.5 28.5T560-120ZM183-426l60-60q-20-8-31.5-16.5T200-520q0-12 18-24t76-37q88-38 117-69t29-70q0-55-44-87.5T280-840q-45 0-80.5 16T145-785q-11 13-9 29t15 26q13 11 29 9t27-13q14-14 31-20t42-6q41 0 60.5 12t19.5 28q0 14-17.5 25.5T262-654q-80 35-111 63.5T120-520q0 32 17 54.5t46 39.5Z"/></svg>',
  minimizeIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fefef8"><path d="M200-120q-33 0-56.5-23.5T120-200v-160h80v160h160v80H200Zm400 0v-80h160v-160h80v160q0 33-23.5 56.5T760-120H600ZM120-600v-160q0-33 23.5-56.5T200-840h160v80H200v160h-80Zm640 0v-160H600v-80h160q33 0 56.5 23.5T840-760v160h-80ZM480-280q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280Z"/><circle cx="480" cy="-480" r="120" fill="blue"/></svg>' ,
  closeIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>',
  reportIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240ZM330-120 120-330v-300l210-210h300l210 210v300L630-120H330Zm34-80h232l164-164v-232L596-760H364L200-596v232l164 164Zm116-280Z"/></svg>',
  moveIcon: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#fefef8"><path d="M320-160q-117 0-198.5-81.5T40-440q0-107 70.5-186.5T287-718l-63-66 56-56 160 160-160 160-56-57 59-59q-71 14-117 69t-46 127q0 83 58.5 141.5T320-240h120v80H320Zm200-360v-280h360v280H520Zm0 360v-280h360v280H520Zm80-80h200v-120H600v120Z"/></svg>',
};

class SnippetorContainer {
  constructor(note, lineNumber, lineNumbers, state, isActiveNote, onLineChangeCallback) {
    this.note = note; // Contains note.id and note.text
    this.lineNumber = lineNumber;
    this.lineNumbers = lineNumbers;
    this.state = state; // Can be "view" or "edit"
    this.circle = null; // Reference to the circle element
    this.onLineChangeCallback = onLineChangeCallback;

    // Attach the instance to the lineNumber element
    this.lineNumber.snippetorInstance = this;

    // Render initial state based on the provided state argument
    this.redraw(isActiveNote);

    // Create a circle element to represent the minimized note
    this.circle = document.createElement("div");
    this.circle.className = "snippetor-note-circle";
    this.lineNumber.appendChild(this.circle);
    
    // Add event listener to the circle to restore the container
    this.circle.addEventListener("click", () => this.onRestore());
   }

  redraw(isActiveNote = false) {
    if (this.state === "view") {
      this.renderPreviewContainer(isActiveNote);
    } else {
      this.renderEditContainer();
    }
  }

  remove() {
    // Remove circle
    if (this.circle) {
      this.circle.remove();
      this.circle = null;
    }
    
    // Remove input container
    if (this.lineNumber.inputContainer) {
      this.lineNumber.inputContainer.remove();
      this.lineNumber.inputContainer = null;
    }

    // remove reference on this
    this.lineNumber.snippetorInstance = null;

    // renmove lines
    this.lineNumber = null;
    this.lineNumbers = null;
  }

  isVisible() { 
    if (!this.lineNumber || !this.lineNumber.inputContainer)
      return false;
    return this.lineNumber.inputContainer.style.display != "none";

  }

  displayContainer(isVisible) {
    // we could hide/show the view containers only
    // edit-state containers should be visible unless user change
    // url or press cancel button
    if (this.lineNumber && this.lineNumber.inputContainer && this.state == "view") {
      this.lineNumber.inputContainer.style.display = isVisible ? "flex" : "none";
    }
  }
  
  // Method to remove any existing container
  removeExistingContainer() {
    if (this.lineNumber.inputContainer) {
      this.lineNumber.inputContainer.remove();
      this.lineNumber.inputContainer = null;
      // this.lineNumber.snippetorInstance = null;
    }
  }

  forceLineUpdate() {
    const errorArea = this.lineNumber.inputContainer.querySelector(".snippetor-error-message");
    // Force to send line position change
    this.onSave(errorArea, this.note.text, true);
  }

  // Method to render preview container
  renderPreviewContainer(isActiveNote) {
    this.removeExistingContainer();

    // Create the container element
    const inputContainer = document.createElement("div");
    inputContainer.className = "snippetor-sn-note-input";

    // Adjust position based on line index
    const rect = this.lineNumber.getBoundingClientRect();
    inputContainer.style.left = "45px";

    // Define the HTML template for preview mode
    inputContainer.innerHTML = `
        <div class="sn-corner"></div>
        <div class="snippetor-close-button-wrapper">
            <div role="group" aria-label="repo link" class="sn-btn-group">
              <button type="button" title="Current tree sha" class="sn-btn sn-active">${this.note.blob.slice(0, 7)}</button>
              <button type="button" title="Default branch" class="sn-btn">${this.note.defaultBranch}</button>
            </div>
            <div class="sn-max-space"></div>
            <span class="snippetor-move-button" title="Move to another line">${strings.moveIcon}</span>
            <span class="snippetor-edit-button" title="Edit text">${strings.editIcon}</span>
            <span class="snippetor-minimize-button" title="Minimize">${strings.minimizeIcon}</span>
        </div>
        <div class="snippetor-note-textarea-wrapper">
            <textarea class="snippetor-note-textarea" readonly>${this.note.text}</textarea>
        </div>
        <div class="snippetor-button-container">
            <button class="snippetor-button snippetor-previous-button">Prev</button>
            <button class="snippetor-button snippetor-next-button">Next</button>
        </div>
    `;
    inputContainer.style.display = isActiveNote ? "flex" : "none"; 
    // Append the inputContainer to the lineNumber
    this.lineNumber.appendChild(inputContainer);
    this.lineNumber.inputContainer = inputContainer;

    // Query the buttons and other elements
    const closeButton = inputContainer.querySelector(".snippetor-minimize-button");
    const editButton = inputContainer.querySelector(".snippetor-edit-button");
    const previousButton = inputContainer.querySelector(".snippetor-previous-button");
    const nextButton = inputContainer.querySelector(".snippetor-next-button");
    const moveButton = inputContainer.querySelector(".snippetor-move-button");

    // Event Listeners for preview mode
    closeButton.addEventListener("click", () => this.onMinimize(inputContainer));
    editButton.addEventListener("click", () => {
      this.state = "edit";
      this.renderEditContainer();
    });
    previousButton.addEventListener("click", () => this.onPrevious());
    nextButton.addEventListener("click", () => this.onNext());
    moveButton.addEventListener("click", () => {
      const isActive = moveButton.classList.contains("sn-move-active");
      if (isActive) {
        moveButton.classList.remove("sn-move-active");
      } else {
        moveButton.classList.add("sn-move-active");
      }
      //
      // Disable active if needed
      this.onLineMove(isActive ? null: this);
    });

    this.updateNextPrev(inputContainer);
  }

  onLineMove(data) {
    if (this.onLineChangeCallback)
      this.onLineChangeCallback(data);
  }

  updateNextPrev(inputContainer) {
    const previousButton = inputContainer.querySelector(".snippetor-previous-button");
    const nextButton = inputContainer.querySelector(".snippetor-next-button");
    nextButton.disabled =  !this.note.hasNext;
    previousButton.disabled = !this.note.hasPrev;
  }

  // Method to render edit container
  renderEditContainer() {
    this.removeExistingContainer();

    // Create the container element
    const inputContainer = document.createElement("div");
    inputContainer.className = "snippetor-sn-note-input";

    // Adjust position based on line index
    const rect = this.lineNumber.getBoundingClientRect();
    inputContainer.style.left = "45px";

    // Define the HTML template for edit mode
    inputContainer.innerHTML = `
        <div class="sn-corner"></div>
        <div class="snippetor-close-button-wrapper">
            <div role="group" aria-label="repo link" class="sn-btn-group">
              <button type="button" title="Current tree sha" class="sn-btn sn-active">${this.note.blob.slice(0, 7)}</button>
              <button type="button" title="Default branch" class="sn-btn">${this.note.defaultBranch}</button>
            </div>
            <div class="sn-max-space"></div>
            <span class="snippetor-close-button">${strings.closeIcon}</span>
        </div>
        <textarea class="snippetor-note-textarea">${this.note.text}</textarea>
        <p class="snippetor-error-message"></p>
        <div class="snippetor-button-container">
            <button class="snippetor-button snippetor-cancel-button">Cancel</button>
            <button class="snippetor-button snippetor-done-button">Save</button>
            <button class="snippetor-button snippetor-update-button">Update</button>
        </div>
    `;

    // Append the inputContainer to the lineNumber
    this.lineNumber.appendChild(inputContainer);
    this.lineNumber.inputContainer = inputContainer;
    if (this.note.id <= 0)
      this.lineNumber.inputContainer.classList.add("snippetor-create");

    // Query the buttons and other elements
    const closeButton = inputContainer.querySelector(".snippetor-close-button");
    const cancelButton = inputContainer.querySelector(".snippetor-cancel-button");
    const doneButton = inputContainer.querySelector(".snippetor-done-button");
    const updateButton = inputContainer.querySelector(".snippetor-update-button");
    const textArea = inputContainer.querySelector(".snippetor-note-textarea");
    const errorArea = inputContainer.querySelector(".snippetor-error-message");

    // Event Listeners for edit mode
    cancelButton.addEventListener("click", () => this.onCancel(inputContainer));
    closeButton.addEventListener("click", () => this.onClose(inputContainer));
    doneButton.addEventListener("click", () => this.onSave(errorArea, textArea.value, false));
    updateButton.addEventListener("click", () => this.onSave(errorArea, textArea.value, true));
  }

  // Callback: Minimize the container and show a circle
  onMinimize(inputContainer) {
    inputContainer.style.display = "none"; // Hide the container
  }

  // Callback: Restore the container from the minimized state
  onRestore() {
    if (this.lineNumber.inputContainer) {
      this.lineNumber.inputContainer.style.display = "flex";
    }
  }

  // Callback: Close the container
  onClose(inputContainer) {
    // remove element if it is create mode
    if (this.note.id <= 0) {
      inputContainer.remove();
      this.lineNumber.snippetorInstance = null; // Remove reference to the instance
    }
    else {
      // and cancel change if it is edit mode
      this.onCancel(inputContainer);
    }
  }

  // Callback: Cancel the edit operation
  onCancel(inputContainer) {
    this.state = "view";
    this.renderPreviewContainer();
  }

  // Callback: Save the note and switch to preview mode
  onSave(errorArea, text, isUpdate) {
    const note = {
      id: this.note.id,
      sid: this.note.sid || -1,
      url: window.location.href,
      text: text.trim(),
      defaultBranch: this.note.defaultBranch,
      blob: this.note.blob
    };

    // Send a message to the background script to save the note
    chrome.runtime.sendMessage({
      action: isUpdate ? "SnBackground.updateNote" : "SnBackground.saveNote",
      note, snippetId: note.sid, isContentScript: true }, (response) => {
      if (response?.success) {
        console.log("Note saved successfully!");
        // After saving, switch back to preview mode
        this.note.text = text.trim(); // Update the text data
        console.log("ASSIGN ID : " + response.noteId);
        this.note.id = response.noteId;
        this.note.sid = response.snippetId;
        this.note.hasNext = response.hasNext;
        this.note.hasPrev = response.hasPrev;
        this.state = "view";
        this.renderPreviewContainer();
        this.displayContainer(true);
      } else {
        // Show failed message
        const td = "Failed to save the note:" + response.error;
        errorArea.innerHTML = strings.reportIcon + td;
      }
    });
  }

  // Callback: Navigate to the previous note or line (logic to be implemented)
  onPrevious() {
    if (this.note.hasPrev) {
      chrome.runtime.sendMessage(
        { action: "SnBackground.openSiblingNoteInCurrentTab", goPrev: true, goNext: false, note: this.note, snippetId: this.note.sid },
        (response) => {
          console.log("RESULT FOR PREV NAVIGATION:", response);
          // this.showDefaultNotes(response.notes, url, response.active_note);
        }
      );
      
    }
    console.log("Previous button clicked");
  }

  // Callback: Navigate to the next note or line (logic to be implemented)
  onNext() {
    console.log("HAS NEXT >", this.note);
    if (this.note.hasNext) {
      chrome.runtime.sendMessage(
        { action: "SnBackground.openSiblingNoteInCurrentTab", goPrev: false, goNext: true, note: this.note, snippetId: this.note.sid },
        (response) => {
          console.log("RESULT FOR NEXT NAVIGATION:", response);
          // this.showDefaultNotes(response.notes, url, response.active_note);
        }
      );

    }
    console.log("Next button clicked");
  }
}

class SnippetorManager {
  constructor() {
    this.currentLocation = "";
    this.currentHash = "";
    this.skipTwice = 2;
    this.isCssAttached = false;
    this.lineChangeNote = null;

    //
    // TODO: Clean up created notes, on remove, and on cancel note creation!!!
    //
    this.createdNotes = [];

    // Attach event listeners when the document is ready
    if (document.readyState === "complete" || document.readyState === "interactive") {
      this.addDoubleClickListeners();
    } else {
      window.addEventListener("DOMContentLoaded", () => this.addDoubleClickListeners());
    }

    // Handle navigation changes
    navigation.addEventListener("navigate", (data) => this.handleNavigation());
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "onNoteAdd") {
        this.showAddedNote({
          id: message.nid,
          text: message.text,
          url: message.url,
          sid: message.sid,
          hasNext: message.hasNext,
          hasPrev: message.hasPrev
        }, message.sid);
      } else if (message.action === "onNoteSelect") {
        //
        // Work-around when notes are in the same file
        //
        this.createdNotes.forEach((wnote) => {
          // hide all except current
          wnote.displayContainer(wnote.note.id == message.nid);
        });
      } else if (message.action === "onNoteUpdate") {
        console.log("Update current note", message);
        this.createdNotes.forEach((wnote) => {
          if (wnote.note.id == message.nid) {
            if (message.text != undefined)
              wnote.note.text = message.text;
            // TODO: handle line change. (move snippet to a new line)
            if (message.url != undefined)
              wnote.note.url = message.url;
            if (message.hasNext != undefined)
              wnote.note.hasNext = message.hasNext;
            if (message.hasPrev != undefined)
              wnote.note.hasPrev = message.hasPrev;
            wnote.redraw(wnote.isVisible());
          }
        });
      } else if (message.action === "onNoteRemove") {
        console.log("MESSAGE !!!!", message);
        this.createdNotes = this.createdNotes.filter((wnote) => {
          
          if (wnote.note.id == message.nid) {
              wnote.remove(); // Remove the actual DOM element
              return false; // Exclude this wnote from the new array
          }
          return true; // Keep this wnote in the new array
        });
      } else if (message.action === "onSnippetRemove") {
        console.log("MESSAGE Remove snippet note ids !!!!", message);
        this.createdNotes = this.createdNotes.filter((wnote) => {
          if (message.nids.includes(wnote.note.id)) {
              wnote.remove(); // Remove the actual DOM element
              return false; // Exclude this wnote from the new array
          }
          return true; // Keep this wnote in the new array
        });
      }
    });
  }

  isBlobUrl(url) {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    return urlObj.protocol === "https:" && pathParts.length > 3 && pathParts[3] === "blob";
  }

  isCodeResource(url) {
    // TODO: add extra media resources if needed
    const excludedExtensions = [
      ".md", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp",
      ".mp3", ".wav", ".ogg", ".flac", ".aac",
      ".mp4", ".mov", ".avi", ".wmv", ".mkv", ".webm"
    ];
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
  
    return !excludedExtensions.some(extension => path.endsWith(extension));
  }

  addDoubleClickListeners(forceTimer = true) {

    // Check that url start with blob and that it is not media resource
    if (!this.isBlobUrl(window.location.href) || !this.isCodeResource(window.location.href)) {
      console.log("NOT A BLOB or CODE resource !! EXIT !");
      return;
    }
    // TODO: check lines from the code area only.
    //       And avoid search lines or "All symbols" container lines on the right side
    const lineNumbers = this.getCodeLines();

    if (lineNumbers.length === 0 && forceTimer) {
      // give 0.3 second for UI to show lines
      setTimeout(() => this.addDoubleClickListeners(), 300);
      return;
    } else {
      console.log("HAS a number of LINES YET !!!" + lineNumbers.length);
    }

    // once
    this.attachGlobalCss();

    lineNumbers.forEach((lineNumber) => {
      if (!lineNumber.hasListenerAttached) {
        lineNumber.addEventListener("dblclick", () => {
          if (lineNumber.snippetorInstance) {
            // Show note again
            lineNumber.snippetorInstance.onRestore();
            return;
          }

          if (this.lineChangeNote != null) {
            this.showPreviewContainer(this.lineChangeNote.note, lineNumber, lineNumbers, true);
            this.lineChangeNote.remove();
            this.lineChangeNote = null;
            
            // force line update message to the backend
            if (lineNumber.snippetorInstance) {
              lineNumber.snippetorInstance.forceLineUpdate();
            }
            return;
          }
          //
          // minimize all containers which are in the view mode
          // to make it easier to show edit container
          // Note: this method does not hide save notes which are in edit mode
          this.hideAllViewContainers();
          // There is no container attached. Make a new one.
          this.showEditContainer({ id: -1, text: "" }, lineNumber, lineNumbers);
        });
        lineNumber.hasListenerAttached = true; // Mark that listener is attached
      }
    });

    // url changed, let's load notes for a new url
    this.loadNotesForCurrentUrl(window.location.href);
  }

  attachGlobalCss() {
    if (this.isCssAttached)
      return;
    this.isCssAttached = true;

    const globalStyles = `
      .snippetor-sn-note-input {
        position: absolute;
        width: 650px;
        background-color: #373F51;
        border: 1px solid #ccc;
        border-radius: 8px;
        border-top-left-radius: 0px;
        padding: 10px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 1000;
        top: 0;
      }
      .snippetor-error-message {
        color: pink;
        display: flex;
        align-items: center;
      }
      .snippetor-note-textarea {
        width: 100%;
        height: 120px;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 5px;
        resize: none;
        display: flex;
      }
      .snippetor-note-textarea-wrapper {
        display: contents;
      }
      .snippetor-note-circle {
        width: 12px;
        height: 12px;
        background-color: blue;
        opacity: 0.5;
        border-radius: 50%;
        position: absolute;
        margin-top: -20px;
        margin-left: 0px;
      }
      .snippetor-close-button {
        cursor: pointer;
        font-size: 18px;
        padding-right: 10px;
        font-weight: bold;
        color: white;
      }
      .snippetor-close-button > svg {
        fill: white;
      }
      
      .snippetor-move-button {
        cursor: pointer;
        font-size: 18px;
        padding-right: 10px;
        font-weight: bold;
        color: white;
      }
      .snippetor-edit-button {
        cursor: pointer;
        font-size: 18px;
        padding-right: 10px;
        font-weight: bold;
        color: white;
      }
      .snippetor-edit-button > svg {
        fill: white;
      }
      .snippetor-button-container {
        display: flex;
        justify-content: flex-end;
        gap: 5px;
      }
      .snippetor-close-button-wrapper {
        width: 100%;
        height: 24px;
        display: flex;
        justify-content: flex-end;
        align-items: center;
      }
      .snippetor-button {
        border-radius: 6px;
        border: none;
        font-size: 12px;
        text-transform: uppercase;
        transition: 0.2s ease all;
        padding-left: 16px;
        padding-right: 16px;
        margin-left: 10px;
      }
      .snippetor-done-button {
        background: #58A4B0;
        color: #fff;
        border: 2px solid white;
        display: none;
      }
      .snippetor-cancel-button {
        background: white;
        color: #373F51;
        border: 2px solid #58A4B0;
      }
      .snippetor-create .snippetor-done-button {
        display: block;
      }
      .snippetor-create .snippetor-update-button {
        display: none;
      }
      /* Button Group Styles */
.sn-btn-group {
  display: flex;
  align-items: center;
  border-radius: 6px;
  height: 28px;
  gap: 4px;
  cursor: pointer;
  text-align: center;
  background-color: #f6f8fa;
  border: 1px solid #d1d9e0;
  padding: 0 4px; /* Optional, for spacing */
  box-shadow: 0px 1px 0px 0px #1f23280a;
}
/* Button Styles */
.sn-btn {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  font-weight: 500;
  font-size: 12px;
  max-height: 28px;
  line-height: 28px;
  background-color: transparent;
  border: none;
  padding: 0 8px;
  border-radius: 4px;
  color: #25292e;
  transition: background-color 0.3s ease;
}
/* Active Button Styles */
.sn-active {
  background-color: #e6eaef;
}
/* Hover Effect */
.sn-btn:hover {
  background-color: #e6eaef;
}
  .sn-max-space {
    flex-grow: 1;
  }
    .sn-corner {
      position: absolute;
      left: -25px;
      top: 0px;
      border-top:  25px solid #373F51;
      border-left: 25px solid transparent;
      width: 0px;
      height: 0px;
    }

    `;

    // Inject the global styles into the page
    const styleElement = document.createElement("style");
    styleElement.type = "text/css";
    styleElement.textContent = globalStyles;
    document.head.appendChild(styleElement);
  }

  showPreviewContainer(note, lineNumber, lineNumbers, isActiveNote = false) {
    if (!lineNumber.snippetorInstance) {
      this.createdNotes.push(new SnippetorContainer(note, lineNumber, lineNumbers, "view", isActiveNote, (data) => {
        this.lineChangeNote = data;
      }));
    } else {
      lineNumber.snippetorInstance.displayContainer(isActiveNote);
    }
  
  }

  hideAllViewContainers() {
    this.createdNotes.forEach((wnote) => {
      // hide all except current
      wnote.displayContainer(false);
    });
  }

  showEditContainer(note, lineNumber, lineNumbers) {
    const blob = this.findEmbeddedDataWithBranchAndOid();
    note.defaultBranch = blob.defaultBranch;
    note.blob = blob.currentOid;
    console.log("HAS Blob:", blob);
    if (!lineNumber.snippetorInstance) {
      this.createdNotes.push(new SnippetorContainer(note, lineNumber, lineNumbers, "edit", true, (data) => {
        this.lineChangeNote = data;
      }));
    } else {
      lineNumber.snippetorInstance.displayContainer(true);
    }
  }

  parseStartLineNumber(url) {
    const hash = new URL(url).hash;

    if (!hash.startsWith("#L")) {
      console.error("No line number information in the URL.");
      return -1;
    }

    const linePart = hash.slice(2); // Remove "#L"
    const startLine = parseInt(linePart.split("-")[0], 10);

    if (!startLine) {
      console.error("Invalid line numbers in the URL.");
      return -1;
    }

    console.log("HAS START LINE AS: " + startLine);
    return startLine;
  }

  getCodeLines() {
    return document.querySelectorAll("div.react-code-file-contents > div.react-line-numbers > div.react-line-number");
  }

  findEmbeddedDataWithBranchAndOid() {
    // Define the script selector as a constant
    const scriptSelector = 'script[data-target="react-app.embeddedData"]';

    // Select all script tags with the specified selector
    const scriptTags = document.querySelectorAll(scriptSelector);

    // Iterate through the script tags and parse the JSON content
    for (const scriptTag of scriptTags) {
        try {
            const jsonData = JSON.parse(scriptTag.textContent);

            // Check if the required properties exist in the JSON object
            if (
                jsonData?.payload?.repo?.defaultBranch &&
                jsonData?.payload?.refInfo?.currentOid
            ) {
                // Return the structure with the required items
                return {
                    defaultBranch: jsonData.payload.repo.defaultBranch,
                    currentOid: jsonData.payload.refInfo.currentOid
                };
            }
        } catch (error) {
            console.error('Error parsing JSON data:', error);
        }
    }

    // Return null if no matching object is found
    return null;
  }

  getCodeLineElement(url) {
    const startLine = this.parseStartLineNumber(url);
    return document.querySelector(`div[data-line-number="${startLine}"]`);
  }

  showAddedNote(note, snippetId) {
    const lines = this.getCodeLines();
    const lineElement = this.getCodeLineElement(note.url);
    if (lines.length > 0 && lineElement) {
      this.showPreviewContainer(note, lineElement, lines, false);
    }
  }

  showDefaultNotes(notes, url, activeId) {
    const lineNumbers = this.getCodeLines();

    notes.forEach((note) => {
      const isActiveNote = note.id === activeId;
      const startLine = this.parseStartLineNumber(note.url);
      const elem = document.querySelector(`div[data-line-number="${startLine}"]`);
      console.log("Evgeny Debug : " + startLine + " HAS ELEMEN:", elem);
      if (elem) {
          this.showPreviewContainer(note, elem, lineNumbers, isActiveNote);
      }
    });
  }

  loadNotesForCurrentUrl(url) {
    console.log("loadNotesForCurrentUrl");
    chrome.runtime.sendMessage(
      { action: "SnBackground.getNotesForUrl", url: url },
      (response) => {
        this.showDefaultNotes(response.notes, url, response.active_note);
      }
    );
  }

  handleNavigation() {
    //
    // TODO: find another way to check navigation change
    //       because we are getting ~4-5 notifications on each
    //       path change.
    if (window.location.pathname !== this.currentLocation) {
      if (this.skipTwice < 2) {
        ++this.skipTwice;
        return;
      }
      this.skipTwice = 0;
      this.currentLocation = window.location.pathname;
      this.currentHash = window.location.hash;
      this.addDoubleClickListeners(true);
    }
    else if (this.currentHash != window.location.hash) {
      console.log("HASH WAS CHANGED");
    }
  }
}

// Initialize url change tracker
const snippetorManager = new SnippetorManager();