document.addEventListener("DOMContentLoaded", () => {
  const noteList = document.getElementById("note-list");

  const renderNotes = () => {
    chrome.runtime.sendMessage({ action: "getNotes" }, (response) => {
      noteList.innerHTML = "";
      response.notes.forEach((note) => {
        const noteElement = document.createElement("div");
        noteElement.className = "note";
        noteElement.innerHTML = `
          <p><strong>URL:</strong> <a href="${note.url}" target="_blank">${note.url}</a></p>
          <p>${note.text}</p>
        `;
        noteList.appendChild(noteElement);
      });
    });
  };

  document.getElementById("new").addEventListener("click", () => {
    alert("Create a new note by double-clicking a line number on GitHub!");
  });

  document.getElementById("save").addEventListener("click", () => {
    alert("Notes saved!");
  });

  document.getElementById("remove").addEventListener("click", () => {
    chrome.storage.sync.set({ notes: [] }, renderNotes);
  });

  renderNotes();
});
