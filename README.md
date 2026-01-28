# Research Catalogue Tool Commenter

A Firefox extension that allows users to interact with tools in Research Catalogue expositions.

## Features

- **Accurate Tool Detection**: Specifically targets Research Catalogue tool elements (`.tool-text`, `.tool-picture`, `.tool-video`, etc.) based on actual RC HTML structure
- **Tool Name Display**: Click on any tool to see its type and ID in a tooltip
- **Subtle Visual Feedback**: Tools are highlighted with minimal blue outlines and hover effects that respect RC's design
- **Smart Tool Recognition**: Uses `data-tool` attributes and CSS classes to accurately identify tool types
- **Storage**: Tracks tool interactions for future comment functionality
- **Responsive Design**: Adapts to RC's mobile-responsive layout

## Installation

### For Development:

1. Open Firefox
2. Navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from this directory

### For Production:

1. Package the extension as a .zip file
2. Submit to Firefox Add-ons store or install as a temporary add-on

## Usage

1. Navigate to any Research Catalogue exposition page (*.researchcatalogue.net)
2. The extension will automatically activate and highlight available tools
3. Click on any highlighted tool to see its name
4. A tooltip will appear showing the tool type/name
5. Tool interactions are stored for future comment functionality

## File Structure

```
rc-tool-commenter/
├── manifest.json          # Extension manifest
├── content.js             # Content script for page interaction
├── background.js          # Background script for extension lifecycle
├── styles.css            # Styles for tooltips and highlights
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── icons/                # Extension icons (to be added)
└── README.md             # This file
```

## Technical Details

### Content Script (content.js)
- Detects Research Catalogue exposition pages
- Identifies tools using specific RC selectors (`.tool-text`, `.tool-picture`, etc.)
- Extracts tool names from `data-tool` attributes and CSS classes
- Adds subtle visual indicators and click handlers
- Displays tool information in styled tooltips
- Stores interaction data for future comment system

### Background Script (background.js)
- Handles extension lifecycle events
- Manages storage and communication
- Monitors tab updates for RC pages

### Popup Interface
- Shows extension status
- Provides usage instructions
- Displays recent tool interactions
- Quick link to Research Catalogue

## Future Enhancements

- **Comment System**: Add ability to leave and view comments on tools
- **User Authentication**: Link comments to user accounts
- **Comment Persistence**: Store comments server-side or locally
- **Comment Display**: Show existing comments on tools
- **Export/Import**: Backup and restore comments

## Browser Compatibility

- Firefox 57+ (uses WebExtensions API)
- Chrome support can be added with minimal manifest changes

## Permissions

- `activeTab`: Access to current tab content
- `storage`: Store tool interactions and comments
- `*://*.researchcatalogue.net/*`: Access to Research Catalogue pages

## Development

To modify the extension:

1. Edit the relevant files
2. Reload the extension in `about:debugging`
3. Test on Research Catalogue pages
4. Check browser console for debug messages

## License

[Add your preferred license here]