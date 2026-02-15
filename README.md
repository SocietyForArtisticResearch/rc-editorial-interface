# Research Catalogue Tool Commenter

A Firefox extension that provides commenting and suggestion capabilities for Research Catalogue expositions with collaborative editing features.

## Features

### Core Functionality
- **Dual Comment/Suggestion System**: Create both comments (green highlights) and suggestions (yellow highlights) on any text within RC tools
- **Interactive Selection**: Select any text and choose to add a comment or suggestion
- **Collaborative Workflows**: Resolve comments and accept suggestions with full audit trails

### Audit Trail & History
- **Full HTML Capture**: Complete tool HTML content stored at time of comment resolution/suggestion acceptance
- **Metadata Tracking**: Timestamps, user actions, and complete change history
- **Export**: JSON export of all tools and their associated comments/suggestions

## Usage

### Creating Comments and Suggestions
1. Navigate to any Research Catalogue exposition page
2. Select any text within a tool
3. Click "Comment" (green button) to add a comment or "Suggest" (yellow button) to propose changes
4. Enter your comment/suggestion text and click "Add"

### Managing Comments and Suggestions
- **Comments**: Click "Resolved" to mark as resolved (removes highlight, stores in audit trail)
- **Suggestions**: Click "Accept" to apply the suggestion (updates RC content, stores in audit trail)
- **Real-time Updates**: Save button shows live count of resolved comments and accepted suggestions

### Editor Mode Features
- Full functionality in both viewer and editor modes
- Automatic feature disabling in editor mode (convert buttons, JSON export/import, text view)
- Smart URL detection for different RC page types

## Architecture

### Content Script (content.js)
**Core Systems:**
- **Mode Detection**: Automatic detection of viewer vs editor modes with URL pattern matching
- **Text Selection**: Text selection handling with span creation and highlighting
- **Storage Management**: Multi-layered browser.storage.local with separate keys for active, resolved, and accepted items
- **RC API Integration**: Direct fetch/POST operations to Research Catalogue endpoints with piggy-back authentication

**Key Functions:**
- `createSuggestionSpan()`: Creates highlighted spans and data attributes
- `acceptSuggestion()`: Processes suggestion acceptance with HTML capture and RC updates
- `resolveComment()`: Handles comment resolution with audit trail storage

**Storage Architecture:**
- `rc_suggestions_[exposition]_[weave]`: Active comments and suggestions
- `rc_resolved_comments_[exposition]_[weave]`: Resolved comment history with full HTML
- `rc_accepted_suggestions_[exposition]_[weave]`: Accepted suggestion history with full HTML
- `rc_exposition_data_[exposition]`: Cached exposition structure and metadata

### Background Script (background.js)
- Extension lifecycle management
- Permission handling for RC domains
- Cross-tab communication support

## Data Flow & Synchronization

### "Exposition is Truth" Principle
The extension follows a synchronization model where RC exposition data is the truth:
1. **Active Storage**: Browser storage maintains working state for editing sessions
2. **RC Sync**: Regular synchronization with RC API ensures data consistency
3. **Audit Trail**: Full HTML content capture preserves complete change history
4. **Fallback Recovery**: Span attribute data provides recovery mechanism for sync timing issues

### Workflow States
1. **Creation**: User selects text → Creates span → Stores in active storage
2. **Resolution/Acceptance**: User action → Captures full HTML → Moves to history storage → Updates RC
3. **Synchronization**: RC data sync → Updates local storage → Preserves span data when present

## API Integration

### Research Catalogue Endpoints
- **Tool Content Retrieval**: GET requests to fetch current tool content
- **Tool Updates**: POST requests to update tool content after suggestion acceptance
- **Authentication**: Automatic session-based authentication using existing RC login
- **Content Conversion**: Automatic simpletext-to-text conversion for span compatibility

## Browser Compatibility & Performance

### Supported Browsers
- **Firefox 57+**: Full WebExtensions API support

## Permissions & Security

### Required Permissions
- `activeTab`: Access to current tab for content injection
- `storage`: Browser storage for comments, suggestions, and audit trails