chrome.commands.onCommand.addListener(async (command) => {
    if (command === "open-fuzzy-find") {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "openFuzzyFind" });
      } catch (error) {
        if (error.message.includes("Receiving end does not exist")) {
          console.log("Fuzzy find cannot be used on this page.");
        } else {
          console.error("Unexpected error opening fuzzy find:", error);
        }
      }
    }
  });