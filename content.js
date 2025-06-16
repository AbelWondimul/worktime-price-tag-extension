// Price detection regex
const PRICE_REGEX = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;

// Cache for processed elements to avoid duplicates
const processedElements = new WeakSet();

// Flag to prevent multiple simultaneous scans
let isScanning = false;

// Flag to track if page is valid for processing
let isPageValid = true;

// Function to check if page is valid for processing
function isValidPage() {
  try {
    // Check if we can access and modify the DOM
    const testElement = document.createElement('div');
    document.body.appendChild(testElement);
    document.body.removeChild(testElement);
    return true;
  } catch (error) {
    console.log('Page is not valid for processing:', error);
    return false;
  }
}

// Function to calculate work time
function calculateWorkTime(price, hourlyWage, hoursPerDay) {
  const workHours = price / hourlyWage;
  const workDays = workHours / hoursPerDay;
  
  return {
    hours: Math.round(workHours * 10) / 10,
    days: Math.round(workDays * 10) / 10
  };
}

// Function to create work time overlay
function createWorkTimeOverlay(workTime) {
  const overlay = document.createElement('span');
  overlay.className = 'worktime-price-tag';
  
  // Only show non-zero values
  let displayText = '';
  if (workTime.hours > 0) {
    displayText += `⏱️ ${workTime.hours} hrs`;
  }
  if (workTime.days > 0) {
    if (displayText) displayText += ' / ';
    displayText += `💼 ${workTime.days} days`;
  }
  
  // If both are 0, don't show the overlay
  if (!displayText) {
    return null;
  }
  
  overlay.innerHTML = displayText;
  return overlay;
}

// Function to safely add to WeakSet
function safeAddToProcessed(element) {
  try {
    if (element instanceof Element) {
      processedElements.add(element);
    }
  } catch (error) {
    console.log('Could not add element to processed set:', error);
  }
}

// Function to process Amazon price elements
function processAmazonPrice(priceElement, hourlyWage, hoursPerDay) {
  if (!isPageValid || !priceElement) return;

  try {
    if (processedElements.has(priceElement)) {
      return;
    }

    // Check if this price element already has a work time overlay
    if (priceElement.nextElementSibling?.classList.contains('worktime-price-tag')) {
      safeAddToProcessed(priceElement);
      return;
    }

    // Get the whole and fraction parts
    const wholePart = priceElement.querySelector('.a-price-whole')?.textContent || '0';
    const fractionPart = priceElement.querySelector('.a-price-fraction')?.textContent || '00';
    
    // Combine the parts and parse as float
    const price = parseFloat(`${wholePart}.${fractionPart}`);

    if (!isNaN(price)) {
      const workTime = calculateWorkTime(price, hourlyWage, hoursPerDay);
      const overlay = createWorkTimeOverlay(workTime);
      
      // Only insert if overlay was created (non-zero values)
      if (overlay) {
        priceElement.parentNode.insertBefore(overlay, priceElement.nextSibling);
      }
      safeAddToProcessed(priceElement);
    }
  } catch (error) {
    console.log('Error processing Amazon price:', error);
  }
}

// Function to process a text node (for non-Amazon prices)
function processTextNode(node, hourlyWage, hoursPerDay) {
  if (!isPageValid) return;

  try {
    if (!node || !node.parentElement || !(node.parentElement instanceof Element)) {
      return;
    }

    // Skip if already processed
    if (processedElements.has(node.parentElement)) {
      return;
    }

    // Skip if parent is a script or style tag
    if (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE') {
      return;
    }

    // Skip if parent already has a work time overlay
    if (node.parentElement.querySelector('.worktime-price-tag')) {
      safeAddToProcessed(node.parentElement);
      return;
    }

    const text = node.textContent;
    let match;
    let lastIndex = 0;
    let newContent = '';

    // Reset regex
    PRICE_REGEX.lastIndex = 0;

    while ((match = PRICE_REGEX.exec(text)) !== null) {
      // Add text before the price
      newContent += text.slice(lastIndex, match.index);
      
      // Get the price value
      const price = parseFloat(match[1].replace(/,/g, ''));
      
      // Calculate work time
      const workTime = calculateWorkTime(price, hourlyWage, hoursPerDay);
      
      // Create price span with overlay
      const priceSpan = document.createElement('span');
      priceSpan.textContent = match[0];
      const overlay = createWorkTimeOverlay(workTime);
      
      // Only add overlay if it exists (non-zero values)
      if (overlay) {
        priceSpan.appendChild(overlay);
      }
      
      // Add the price span to new content
      newContent += priceSpan.outerHTML;
      
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    newContent += text.slice(lastIndex);

    // Only update if we found prices
    if (lastIndex > 0) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newContent;
      
      // Replace the text node with the new content
      if (node.parentNode) {
        node.parentNode.replaceChild(tempDiv.firstChild, node);
        safeAddToProcessed(node.parentElement);
      }
    }
  } catch (error) {
    console.log('Error processing text node:', error);
  }
}

// Function to scan the page for prices
function scanPage(hourlyWage, hoursPerDay) {
  if (!isPageValid || isScanning) {
    return;
  }

  if (!hourlyWage || !hoursPerDay) {
    return;
  }

  isScanning = true;

  try {
    // First, look for Amazon price elements
    const amazonPrices = document.querySelectorAll('.a-price');
    
    amazonPrices.forEach(priceElement => {
      processAmazonPrice(priceElement, hourlyWage, hoursPerDay);
    });

    // Then scan for other prices using the regex method
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip empty text nodes and nodes within Amazon price elements
          if (!node.textContent.trim() || 
              node.parentElement?.closest('.a-price') ||
              node.parentElement?.querySelector('.worktime-price-tag')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    let node;
    while (node = walker.nextNode()) {
      processTextNode(node, hourlyWage, hoursPerDay);
    }
  } catch (error) {
    console.log('Error scanning page:', error);
    isPageValid = false;
  } finally {
    isScanning = false;
  }
}

// Initialize MutationObserver with improved debounce
let debounceTimer;
const observer = new MutationObserver((mutations) => {
  if (!isPageValid) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    chrome.storage.local.get(['hourlyWage', 'hoursPerDay'], (result) => {
      if (result.hourlyWage && result.hoursPerDay) {
        scanPage(result.hourlyWage, result.hoursPerDay);
      }
    });
  }, 1000);
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isPageValid) return;

  if (message.type === 'updatePrices') {
    chrome.storage.local.get(['hourlyWage', 'hoursPerDay'], (result) => {
      if (result.hourlyWage && result.hoursPerDay) {
        scanPage(result.hourlyWage, result.hoursPerDay);
      }
    });
  }
});

// Check if page is valid before initial scan
isPageValid = isValidPage();

// Initial scan after a delay to ensure page is loaded
setTimeout(() => {
  if (isPageValid) {
    chrome.storage.local.get(['hourlyWage', 'hoursPerDay'], (result) => {
      if (result.hourlyWage && result.hoursPerDay) {
        scanPage(result.hourlyWage, result.hoursPerDay);
      }
    });
  }
}, 2000); 