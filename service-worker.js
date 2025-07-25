// This is the service worker file.

// Listen for the 'push' event.
// This is the service worker file.

// Listen for the 'push' event, which is triggered when the server sends a notification.
self.addEventListener('push', event => {
  // The data sent from the server is in event.data.
  // We parse it as JSON because we sent a JSON string from our Node.js server.
  const data = event.data.json();

  console.log('✅ Push notification received:', data);

  // These are the options for the notification pop-up.
  const options = {
    body: data.message, // The main text of the notification
    icon: './path/to/your/app-icon.png', // Optional: A path to an icon image for your app
    badge: './path/to/your/badge-icon.png', // Optional: A small badge icon
    // Here we store data that we can use when the user clicks the notification.
    data: {
      url: '/notification.html' // The URL to open when clicked.
    }
  };

  // This command tells the browser to display the notification.
  // It will wait until this promise resolves before finishing.
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Listen for the 'notificationclick' event, which happens when a user clicks on the notification.
self.addEventListener('notificationclick', event => {
  // First, close the notification that was clicked.
  event.notification.close();

  // This tells the browser to wait until our new window is opened.
  // We get the URL from the 'data' object we stored in the push event.
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});