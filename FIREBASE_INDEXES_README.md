# Firebase Index Deployment Instructions

## Important: You need to create these indexes in Firebase Console for the chat and polls to work

### Option 1: Deploy via Firebase CLI (Recommended)

1. Install Firebase CLI if you haven't:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize Firebase in the backend directory:
```bash
cd Turds-Backend
firebase init firestore
```

4. Deploy the indexes:
```bash
firebase deploy --only firestore:indexes
```

### Option 2: Manual Creation in Firebase Console

Go to Firebase Console > Firestore Database > Indexes and create these composite indexes:

#### 1. For Chat Messages:
- Collection: `chat_messages`
- Fields:
  - `room` (Ascending)
  - `timestamp` (Descending)

#### 2. For Government Polls:
- Collection: `government_polls`
- Fields:
  - `isActive` (Ascending)
  - `createdAt` (Descending)

#### 3. For Broadcast Messages:
- Collection: `broadcast_messages`
- Fields:
  - `isActive` (Ascending)
  - `createdAt` (Descending)

#### 4. For Online Admins:
- Collection: `online_admins`
- Fields:
  - `lastSeen` (Descending)

## Troubleshooting

If you see errors in the console like "The query requires an index", click the error link which will take you directly to Firebase Console to create the required index.

The indexes may take a few minutes to build after creation.
