document.addEventListener('DOMContentLoaded', () => {
  const hourlyWageInput = document.getElementById('hourlyWage');
  const hoursPerDayInput = document.getElementById('hoursPerDay');
  const saveButton = document.getElementById('saveButton');
  const saveConfirmation = document.getElementById('saveConfirmation');

  
  chrome.storage.local.get(['hourlyWage', 'hoursPerDay'], (result) => {
    if (result.hourlyWage) {
      hourlyWageInput.value = result.hourlyWage;
    }
    if (result.hoursPerDay) {
      hoursPerDayInput.value = result.hoursPerDay;
    }
  });

  // Save settings
  saveButton.addEventListener('click', () => {
    const hourlyWage = parseFloat(hourlyWageInput.value);
    const hoursPerDay = parseFloat(hoursPerDayInput.value);

    if (isNaN(hourlyWage) || hourlyWage <= 0) {
      alert('Please enter a valid hourly wage');
      return;
    }

    if (isNaN(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) {
      alert('Please enter valid hours per day (1-24)');
      return;
    }

    chrome.storage.local.set({
      hourlyWage,
      hoursPerDay
    }, () => {
      
      saveConfirmation.classList.remove('hidden');
      setTimeout(() => {
        saveConfirmation.classList.add('hidden');
      }, 2000);

      
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {type: 'updatePrices'});
      });
    });
  });
}); 