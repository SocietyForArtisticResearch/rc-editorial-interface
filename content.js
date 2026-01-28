// Content script for Research Catalogue Tool Commenter
// This script runs on Research Catalogue exposition pages

console.log('RC Tool Commenter: Content script loaded');

// Function to detect if we're on a Research Catalogue exposition page
function isExpositionPage() {
    return window.location.hostname.includes('researchcatalogue.net') && 
           (window.location.pathname.includes('/exposition/') || 
            window.location.pathname.includes('/view/'));
}

// Function to identify tool elements in the exposition
function identifyTools() {
    // Research Catalogue uses specific tool classes based on the HTML structure
    // Tools are elements with class starting with 'tool-' and have data-tool attribute
    const toolSelectors = [
        '.tool-text',
        '.tool-simpletext'
        //'.tool-picture', 
        //'.tool-video',
        //'.tool-audio',
        //'.tool-pdf',
        //'.tool-slideshow'    
    ];
    
    let tools = [];
    
    // Debug: Log all potential tools found
    console.log('RC Tool Commenter: Searching for tools...');
    
    toolSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`Found ${elements.length} elements with selector "${selector}"`);
        
        elements.forEach(element => {
            // Exclude tool-content divs - only target actual tool containers
            if (!element.hasAttribute('data-rc-tool-enhanced') && 
                !element.classList.contains('tool-content')) {
                console.log(`Adding tool:`, element, `Class: ${element.className}, Data-tool: ${element.dataset.tool}`);
                tools.push(element);
            } else {
                console.log(`Skipping tool (already enhanced or tool-content):`, element);
            }
        });
    });
    
    // Also look for any div with class starting with 'tool-' that has data-tool attribute
    // But only if we're looking for text tools specifically
    const genericTools = document.querySelectorAll('div.tool-text[data-tool], div.tool-simpletext[data-tool]');
    console.log(`Found ${genericTools.length} generic text tool elements`);
    
    genericTools.forEach(element => {
        if (!element.hasAttribute('data-rc-tool-enhanced') && 
            !element.classList.contains('tool-content') &&
            !tools.includes(element)) {
            console.log(`Adding generic text tool:`, element);
            tools.push(element);
        }
    });
    
    console.log(`RC Tool Commenter: Total tools to enhance: ${tools.length}`);
    
    // Create save button if tools were found
    if (tools.length > 0) {
        createSaveButton();
    }
    
    return tools;
}

// Function to extract exposition and weave IDs from URL
function extractFromUrl(type) {
    const url = window.location.href;
    const match = url.match(/\/view\/(\d+)\/(\d+)/);
    if (match) {
        return type === 'exposition' ? match[1] : match[2];
    }
    return null;
}

// Function to extract tool content
function extractToolContent(tool) {
    // Extract exposition and weave IDs from the page
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    
    const toolData = {
        id: tool.dataset.id || 'unknown',
        type: tool.dataset.tool || 'unknown',
        title: tool.dataset.title || '',
        className: tool.className,
        expositionId: expositionId,
        weaveId: weaveId,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        content: ''
    };
    
    // Extract text content based on tool type
    if (tool.dataset.tool === 'text') {
        const textContent = tool.querySelector('.html-text-editor-content');
        if (textContent) {
            // Get both plain text and HTML content
            toolData.content = {
                plainText: textContent.innerText.trim(),
                html: textContent.innerHTML.trim()
            };
        }
    }
    
    // Add position/style info
    const rect = tool.getBoundingClientRect();
    toolData.position = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
    };
    
    // Add data attributes
    toolData.dataAttributes = {};
    for (let attr of tool.attributes) {
        if (attr.name.startsWith('data-')) {
            toolData.dataAttributes[attr.name] = attr.value;
        }
    }
    
    return toolData;
}

// Function to store tools in browser storage by exposition and weave
async function storeToolsInMemory(tools) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    
    console.log(`Storing ${tools.length} tools for exposition ${expositionId}, weave ${weaveId}`);
    
    // Get existing stored tools for this exposition
    const storageKey = `rc_exposition_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    let expositionData = result[storageKey] || {
        expositionId: expositionId,
        weaves: {},
        lastUpdated: new Date().toISOString()
    };
    
    // Prepare tools data for current weave
    const weaveTools = [];
    tools.forEach(tool => {
        const toolData = extractToolContent(tool);
        weaveTools.push(toolData);
    });
    
    // Store tools organized by weave
    expositionData.weaves[weaveId] = {
        weaveId: weaveId,
        url: window.location.href,
        tools: weaveTools,
        lastVisited: new Date().toISOString(),
        pageTitle: document.title
    };
    
    expositionData.lastUpdated = new Date().toISOString();
    
    // Save back to storage
    await browser.storage.local.set({ [storageKey]: expositionData });
    console.log(`Stored exposition data:`, expositionData);
    
    // Update button text to show total count across all weaves
    await updateSaveButtonCount(expositionData);
}

// Function to update save button with total tool count
async function updateSaveButtonCount(expositionData) {
    const saveButton = document.getElementById('rc-save-tools-btn');
    if (!saveButton) return;
    
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    
    // Get suggestion count
    const suggestionsKey = `rc_suggestions_${expositionId}`;
    const suggestionsResult = await browser.storage.local.get(suggestionsKey);
    const suggestions = suggestionsResult[suggestionsKey] || [];
    
    let totalTools = 0;
    let weaveCount = 0;
    
    Object.values(expositionData.weaves).forEach(weave => {
        totalTools += weave.tools.length;
        weaveCount++;
    });
    
    const buttonText = saveButton.querySelector('span') || saveButton;
    buttonText.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
            <path fill="currentColor" d="M13 0H3a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V3a3 3 0 0 0-3-3zM8 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11 14.5H5a.5.5 0 0 1 0-1h6a.5.5 0 0 1 0 1z"/>
        </svg>
        Save ${totalTools} Tools, ${suggestions.length} Suggestions (${weaveCount} weaves)
    `;
}

// Function to create save button
function createSaveButton() {
    // Remove existing button if present
    const existingButton = document.getElementById('rc-save-tools-btn');
    if (existingButton) {
        existingButton.remove();
    }
    
    const saveButton = document.createElement('button');
    saveButton.id = 'rc-save-tools-btn';
    saveButton.className = 'rc-save-button';
    saveButton.innerHTML = `
        <span>
            <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 6px;">
                <path fill="currentColor" d="M13 0H3a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V3a3 3 0 0 0-3-3zM8 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11 14.5H5a.5.5 0 0 1 0-1h6a.5.5 0 0 1 0 1z"/>
            </svg>
            Save Tools as JSON
        </span>
    `;
    
    saveButton.addEventListener('click', () => {
        saveAllToolsAsJSON();
    });
    
    document.body.appendChild(saveButton);
}

// Function to save all tools from all visited weaves as JSON
async function saveAllToolsAsJSON() {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    
    // Get stored tools for this exposition
    const storageKey = `rc_exposition_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    const expositionData = result[storageKey];
    
    // Get stored suggestions for this exposition
    const suggestionsKey = `rc_suggestions_${expositionId}`;
    const suggestionsResult = await browser.storage.local.get(suggestionsKey);
    const suggestions = suggestionsResult[suggestionsKey] || [];
    
    if (!expositionData || !expositionData.weaves || Object.keys(expositionData.weaves).length === 0) {
        showNotification('No tools found to save');
        return;
    }
    
    // Group suggestions by tool ID
    const suggestionsByTool = {};
    suggestions.forEach(suggestion => {
        if (!suggestionsByTool[suggestion.toolId]) {
            suggestionsByTool[suggestion.toolId] = [];
        }
        suggestionsByTool[suggestion.toolId].push(suggestion);
    });
    
    // Create comprehensive JSON structure
    const exportData = {
        exposition: {
            id: expositionId,
            exportTimestamp: new Date().toISOString(),
            totalWeaves: Object.keys(expositionData.weaves).length,
            totalTools: Object.values(expositionData.weaves).reduce((sum, weave) => sum + weave.tools.length, 0),
            totalSuggestions: suggestions.length
        },
        weaves: {},
        suggestions: {
            total: suggestions.length,
            byTool: suggestionsByTool,
            all: suggestions
        }
    };
    
    // Organize tools by weave and add suggestion counts
    Object.entries(expositionData.weaves).forEach(([weaveId, weaveData]) => {
        const toolsWithSuggestions = weaveData.tools.map(tool => {
            const toolSuggestions = suggestionsByTool[tool.id] || [];
            return {
                ...tool,
                suggestionCount: toolSuggestions.length,
                suggestions: toolSuggestions
            };
        });
        
        exportData.weaves[weaveId] = {
            weaveId: weaveId,
            url: weaveData.url,
            pageTitle: weaveData.pageTitle,
            lastVisited: weaveData.lastVisited,
            toolCount: weaveData.tools.length,
            suggestionCount: toolsWithSuggestions.reduce((sum, tool) => sum + tool.suggestionCount, 0),
            tools: toolsWithSuggestions
        };
    });
    
    // Create downloadable JSON file
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `rc-exposition-${expositionId}-tools-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Show confirmation
    const weaveCount = Object.keys(expositionData.weaves).length;
    const toolCount = Object.values(expositionData.weaves).reduce((sum, weave) => sum + weave.tools.length, 0);
    const suggestionCount = suggestions.length;
    showNotification(`Saved ${toolCount} tools and ${suggestionCount} suggestions from ${weaveCount} weaves`);
}

// Function to save tools as JSON (legacy - keeping for backwards compatibility)
function saveToolsAsJSON() {
    saveAllToolsAsJSON();
}

// Function to create text suggestion interface
function createTextSuggestionInterface(tool, clickX, clickY) {
    // Remove any existing suggestion interface
    const existingSuggestion = document.getElementById('rc-text-suggestion');
    if (existingSuggestion) {
        existingSuggestion.remove();
    }
    
    // Create suggestion overlay
    const suggestionOverlay = document.createElement('div');
    suggestionOverlay.id = 'rc-text-suggestion';
    suggestionOverlay.className = 'rc-text-suggestion-overlay';
    
    // Find text content within the tool
    const textContent = tool.querySelector('.html-text-editor-content');
    if (!textContent) {
        showNotification('No editable text found in this tool');
        return;
    }
    
    // Create suggestion interface HTML
    suggestionOverlay.innerHTML = `
        <div class="rc-suggestion-header">
            <h3>Suggest Text Edits</h3>
            <button class="rc-close-suggestion" title="Close">×</button>
        </div>
        <div class="rc-suggestion-content">
            <div class="rc-text-selection-area">
                <p><strong>Instructions:</strong> Select text below to add suggestions</p>
                <div class="rc-selectable-text" contenteditable="false">${textContent.innerHTML}</div>
            </div>
            <div class="rc-suggestion-form" style="display: none;">
                <div class="rc-selected-text-display">
                    <label>Selected text:</label>
                    <div class="rc-selected-text"></div>
                </div>
                <div class="rc-suggestion-input">
                    <label for="rc-suggestion-text">Your suggestion:</label>
                    <textarea id="rc-suggestion-text" placeholder="Suggest changes for the selected text..." rows="3"></textarea>
                </div>
                <div class="rc-suggestion-actions">
                    <button class="rc-save-suggestion">Save Suggestion</button>
                    <button class="rc-cancel-suggestion">Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    // Position overlay
    suggestionOverlay.style.cssText = `
        position: fixed;
        top: 50px;
        right: 20px;
        width: 400px;
        max-height: 80vh;
        background: white;
        border: 2px solid #007bff;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        overflow-y: auto;
    `;
    
    document.body.appendChild(suggestionOverlay);
    
    // Set up event handlers
    setupSuggestionEventHandlers(suggestionOverlay, tool);
    
    return suggestionOverlay;
}

// Function to set up suggestion interface event handlers
function setupSuggestionEventHandlers(overlay, tool) {
    const closeBtn = overlay.querySelector('.rc-close-suggestion');
    const selectableText = overlay.querySelector('.rc-selectable-text');
    const suggestionForm = overlay.querySelector('.rc-suggestion-form');
    const selectedTextDisplay = overlay.querySelector('.rc-selected-text');
    const suggestionTextarea = overlay.querySelector('#rc-suggestion-text');
    const saveBtn = overlay.querySelector('.rc-save-suggestion');
    const cancelBtn = overlay.querySelector('.rc-cancel-suggestion');
    
    let currentSelection = null;
    
    // Close button
    closeBtn.addEventListener('click', () => {
        overlay.remove();
    });
    
    // Text selection handling
    selectableText.addEventListener('mouseup', () => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText.length > 0) {
            // Check if selection is within our selectable area
            const range = selection.getRangeAt(0);
            if (selectableText.contains(range.commonAncestorContainer)) {
                currentSelection = {
                    text: selectedText,
                    range: range.cloneRange(),
                    startOffset: range.startOffset,
                    endOffset: range.endOffset,
                    startContainer: range.startContainer,
                    endContainer: range.endContainer
                };
                
                // Highlight selected text
                highlightSelectedText(range, selectableText);
                
                // Show suggestion form
                selectedTextDisplay.textContent = selectedText;
                suggestionForm.style.display = 'block';
                suggestionTextarea.focus();
            }
        }
    });
    
    // Save suggestion
    saveBtn.addEventListener('click', async () => {
        if (!currentSelection || !suggestionTextarea.value.trim()) {
            showNotification('Please select text and enter a suggestion');
            return;
        }
        
        await saveSuggestion(tool, currentSelection, suggestionTextarea.value.trim());
        overlay.remove();
        showNotification('Suggestion saved successfully');
    });
    
    // Cancel suggestion
    cancelBtn.addEventListener('click', () => {
        suggestionForm.style.display = 'none';
        clearHighlights(selectableText);
        currentSelection = null;
    });
    
    // Close on escape key
    document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    });
}

// Function to highlight selected text
function highlightSelectedText(range, container) {
    // Clear previous highlights
    clearHighlights(container);
    
    // Create highlight span
    const highlight = document.createElement('span');
    highlight.className = 'rc-text-highlight';
    highlight.style.cssText = `
        background: rgba(255, 235, 59, 0.6);
        border: 1px solid rgba(255, 193, 7, 0.8);
        border-radius: 2px;
        padding: 1px 2px;
    `;
    
    try {
        range.surroundContents(highlight);
    } catch (e) {
        // Fallback for complex selections
        const contents = range.extractContents();
        highlight.appendChild(contents);
        range.insertNode(highlight);
    }
}

// Function to clear text highlights
function clearHighlights(container) {
    const highlights = container.querySelectorAll('.rc-text-highlight');
    highlights.forEach(highlight => {
        const parent = highlight.parentNode;
        while (highlight.firstChild) {
            parent.insertBefore(highlight.firstChild, highlight);
        }
        parent.removeChild(highlight);
    });
}

// Function to save suggestion
async function saveSuggestion(tool, selection, suggestionText) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const weaveId = bodyElement.dataset.weave || extractFromUrl('weave') || 'unknown';
    const toolId = tool.dataset.id || 'unknown';
    
    const suggestion = {
        id: `suggestion_${Date.now()}`,
        toolId: toolId,
        expositionId: expositionId,
        weaveId: weaveId,
        selectedText: selection.text,
        suggestion: suggestionText,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        toolType: tool.dataset.tool || 'unknown'
    };
    
    // Store suggestion in browser storage
    const storageKey = `rc_suggestions_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    const suggestions = result[storageKey] || [];
    
    suggestions.push(suggestion);
    await browser.storage.local.set({ [storageKey]: suggestions });
    
    console.log('Saved suggestion:', suggestion);
    
    // Update tool's stored data to include suggestion count
    await updateToolWithSuggestionCount(tool);
    
    // Update save button with new suggestion count
    const expositionStorageKey = `rc_exposition_${expositionId}`;
    const expositionResult = await browser.storage.local.get(expositionStorageKey);
    if (expositionResult[expositionStorageKey]) {
        await updateSaveButtonCount(expositionResult[expositionStorageKey]);
    }
}

// Function to update tool with suggestion count
async function updateToolWithSuggestionCount(tool) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const toolId = tool.dataset.id || 'unknown';
    
    // Get suggestions for this tool
    const storageKey = `rc_suggestions_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    const suggestions = result[storageKey] || [];
    
    const toolSuggestions = suggestions.filter(s => s.toolId === toolId);
    
    // Use the centralized badge function
    addSuggestionBadge(tool, toolSuggestions.length);
}

// Function to show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'rc-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Function to get tool name/type
function getToolName(element) {
    // Try to extract tool name from data-tool attribute first (most reliable)
    let toolName = '';
    
    if (element.dataset.tool) {
        toolName = element.dataset.tool;
    } else {
        // Extract tool type from class names
        const classes = element.className.split(' ');
        const toolClass = classes.find(cls => cls.startsWith('tool-'));
        if (toolClass) {
            // Convert class name to readable format
            toolName = toolClass.replace('tool-', '').replace(/[-_]/g, ' ');
            // Capitalize first letter of each word
            toolName = toolName.replace(/\b\w/g, l => l.toUpperCase());
        }
    }
    
    // If still no name found, try to infer from content or fallback
    if (!toolName) {
        if (element.querySelector('img')) {
            toolName = 'Picture';
        } else if (element.querySelector('video')) {
            toolName = 'Video';
        } else if (element.querySelector('audio')) {
            toolName = 'Audio';
        } else if (element.querySelector('.html-text-editor-content')) {
            toolName = 'Text';
        } else {
            toolName = 'Media Tool';
        }
    }
    
    // Get additional info from data attributes if available
    const toolId = element.dataset.id;
    const toolTitle = element.dataset.title;
    
    if (toolTitle && toolTitle.trim()) {
        toolName += ` - ${toolTitle}`;
    } else if (toolId) {
        toolName += ` (ID: ${toolId})`;
    }
    
    return toolName || 'Unknown Tool';
}

// Function to create and show tool name display
function showToolName(toolName, x, y) {
    // Remove any existing tooltip
    const existingTooltip = document.getElementById('rc-tool-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.id = 'rc-tool-tooltip';
    tooltip.className = 'rc-tool-tooltip';
    tooltip.textContent = toolName;
    
    // Position tooltip
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    
    document.body.appendChild(tooltip);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        if (tooltip && tooltip.parentNode) {
            tooltip.remove();
        }
    }, 3000);
}

// Function to enhance tools with click handlers
async function enhanceTools() {
    const tools = identifyTools();
    
    console.log(`RC Tool Commenter: Found ${tools.length} tools to enhance`);
    
    // Store found tools in memory for cross-weave collection
    if (tools.length > 0) {
        await storeToolsInMemory(tools);
    }
    
    // Restore suggestion badges for tools that have suggestions
    await restoreSuggestionBadges(tools);
    
    tools.forEach((tool, index) => {
        // Mark as enhanced to avoid duplicate processing
        tool.setAttribute('data-rc-tool-enhanced', 'true');
        
        // Add visual indicator (more subtle for RC interface)
        tool.style.cursor = 'pointer';
        tool.style.outline = '1px dashed rgba(0, 123, 255, 0.4)';
        tool.style.outlineOffset = '1px';
        tool.style.transition = 'outline 0.2s ease-in-out';
        
        // Add a subtle overlay to indicate interactivity
        const overlay = document.createElement('div');
        overlay.className = 'rc-tool-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 123, 255, 0.05);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            z-index: 1;
        `;
        
        // Insert overlay as first child to ensure it doesn't interfere with content
        if (tool.style.position !== 'absolute' && tool.style.position !== 'relative') {
            tool.style.position = 'relative';
        }
        tool.insertBefore(overlay, tool.firstChild);
        
        // Add click handler
        tool.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const toolType = tool.dataset.tool;
            
            // For text tools, open suggestion interface
            if (toolType === 'text' || toolType === 'simpletext') {
                createTextSuggestionInterface(tool, event.clientX, event.clientY);
            } else {
                // For other tools, show tooltip as before
                const toolName = getToolName(tool);
                const x = event.clientX;
                const y = event.clientY - 40;
                
                console.log(`RC Tool Commenter: Clicked on tool "${toolName}"`);
                showToolName(toolName, x, y);
            }
        });
        
        // Add hover effect
        tool.addEventListener('mouseenter', () => {
            tool.style.outline = '1px solid rgba(0, 123, 255, 0.8)';
            const overlay = tool.querySelector('.rc-tool-overlay');
            if (overlay) {
                overlay.style.opacity = '1';
            }
        });
        
        tool.addEventListener('mouseleave', () => {
            tool.style.outline = '1px dashed rgba(0, 123, 255, 0.4)';
            const overlay = tool.querySelector('.rc-tool-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
            }
        });
    });
}

// Function to restore suggestion badges when navigating between weaves
async function restoreSuggestionBadges(tools) {
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    
    // Get all suggestions for this exposition
    const storageKey = `rc_suggestions_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    const suggestions = result[storageKey] || [];
    
    // Group suggestions by tool ID
    const suggestionsByTool = {};
    suggestions.forEach(suggestion => {
        if (!suggestionsByTool[suggestion.toolId]) {
            suggestionsByTool[suggestion.toolId] = [];
        }
        suggestionsByTool[suggestion.toolId].push(suggestion);
    });
    
    // Add badges to tools that have suggestions
    tools.forEach(tool => {
        const toolId = tool.dataset.id;
        if (toolId && suggestionsByTool[toolId]) {
            const suggestionCount = suggestionsByTool[toolId].length;
            addSuggestionBadge(tool, suggestionCount);
        }
    });
}

// Function to add suggestion badge to a tool
function addSuggestionBadge(tool, count) {
    // Remove existing badge
    const existing = tool.querySelector('.rc-suggestion-count');
    if (existing) {
        existing.remove();
    }
    
    if (count > 0) {
        const badge = document.createElement('div');
        badge.className = 'rc-suggestion-count';
        badge.textContent = count;
        badge.style.cssText = `
            position: absolute;
            top: -8px;
            right: -8px;
            background: #dc3545;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 11px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        `;
        
        tool.appendChild(badge);
    }
}

// Function to initialize the extension
async function initializeExtension() {
    if (!isExpositionPage()) {
        console.log('RC Tool Commenter: Not on a Research Catalogue exposition page');
        return;
    }
    
    console.log('RC Tool Commenter: Initializing on exposition page');
    
    // Debug: Check all available tools on the page
    const allTools = document.querySelectorAll('[class*="tool-"]');
    console.log('RC Tool Commenter: All elements with "tool-" in class:', allTools.length);
    allTools.forEach((tool, i) => {
        console.log(`Tool ${i+1}:`, tool.className, 'Data-tool:', tool.dataset.tool, tool);
    });
    
    // Load existing data to update button count
    const bodyElement = document.body;
    const expositionId = bodyElement.dataset.research || extractFromUrl('exposition') || 'unknown';
    const storageKey = `rc_exposition_${expositionId}`;
    const result = await browser.storage.local.get(storageKey);
    
    // Initial enhancement
    enhanceTools();
    
    // Update button with existing counts if available
    if (result[storageKey]) {
        await updateSaveButtonCount(result[storageKey]);
    }
    
    // Watch for dynamically added content
    const observer = new MutationObserver((mutations) => {
        let shouldRecheck = false;
        
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                shouldRecheck = true;
            }
        });
        
        if (shouldRecheck) {
            setTimeout(enhanceTools, 500); // Delay to allow content to settle
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Wait for page to load and initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}

// Also run after a delay for dynamic content
setTimeout(initializeExtension, 2000);