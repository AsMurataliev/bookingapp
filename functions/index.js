const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { shopNameTriggers } = require('./triggers');

admin.initializeApp();

// CORS configuration - only allow trusted origins
const ALLOWED_ORIGINS = [
    'https://barbersbuddies.com',
    'https://www.barbersbuddies.com',
    'http://localhost:3000'
];

const setCorsHeaders = (req, res) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
};

// =============================================================================
// EMAIL SENDING DISABLED - Using console.log and Firestore logging instead
// To re-enable, configure Mailgun in functions config:
// firebase functions:config:set mailgun.key="xxx" mailgun.domain="xxx"
// =============================================================================

const logEmail = (type, to, data) => {
    console.log('========================================');
    console.log(`[EMAIL DISABLED] ${type}`);
    console.log(`[EMAIL DISABLED] To: ${to}`);
    console.log(`[EMAIL DISABLED] Subject: ${data.subject || 'N/A'}`);
    console.log(`[EMAIL DISABLED] Booking ID: ${data.bookingId || 'N/A'}`);
    console.log('========================================');
    return admin.firestore().collection('emailLogs').add({
        type,
        to,
        subject: data.subject || 'N/A',
        bookingId: data.bookingId || null,
        customerName: data.userName || 'N/A',
        shopName: data.shopName || 'N/A',
        appointmentDate: data.selectedDate || data.newDate || 'N/A',
        appointmentTime: data.selectedTime || data.newTime || 'N/A',
        status: 'disabled',
        reason: 'Email sending disabled - using console.log instead',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.log('Failed to log email:', err));
};

exports.createBooking = functions.https.onRequest(async (req, res) => {
    console.log('[createBooking] Function started');

    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({error: 'Method Not Allowed'});
        return;
    }

    const {
        shopId,
        shopEmail,
        userName,
        userEmail,
        userPhone,
        selectedDate,
        selectedServices,
        customService,
        selectedTime
    } = req.body;

    if (!shopId || !shopEmail || !userName || !userEmail || !selectedDate || !selectedServices || selectedServices.length === 0 || !selectedTime) {
        console.log('[createBooking] Missing required fields');
        res.status(400).json({error: 'Missing required fields'});
        return;
    }

    try {
        const bookingRef = await admin.firestore().collection('bookings').add({
            shopId,
            shopOwnerId: req.body.shopOwnerId || null,
            shopEmail,
            userName,
            userEmail,
            userPhone,
            selectedDate,
            selectedServices,
            customService,
            selectedTime,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const bookingId = bookingRef.id;
        console.log(`[createBooking] Booking saved with ID: ${bookingId}`);

        // Log email notifications (disabled)
        const servicesList = selectedServices.map(s => `${s.name} (тВм${s.price})`).join(', ');
        const totalPrice = selectedServices.reduce((sum, s) => sum + parseFloat(s.price), 0).toFixed(2);

        await logEmail('booking_created_shop', shopEmail, {
            subject: `New Booking - ID: ${bookingId}`,
            bookingId,
            userName,
            selectedDate,
            selectedTime,
            services: servicesList,
            totalPrice
        });

        await logEmail('booking_created_customer', userEmail, {
            subject: 'Booking Confirmation',
            bookingId,
            userName,
            selectedDate,
            selectedTime,
            services: servicesList,
            totalPrice
        });

        console.log('[createBooking] Booking process completed successfully');
        res.status(200).json({message: 'Booking created successfully', bookingId});
    } catch (error) {
        console.error('[createBooking] Error:', error);
        res.status(500).json({error: 'Error creating booking', details: error.message});
    }
});

exports.onShopCreate = require('./triggers').onShopCreate;
exports.onShopDelete = require('./triggers').onShopDelete;
exports.onShopUpdate = require('./triggers').onShopUpdate;

exports.updateBooking = functions.https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({error: 'Method Not Allowed'});
        return;
    }

    const { bookingId, selectedDate, selectedTime, selectedServices, notes, totalPrice } = req.body;

    try {
        const bookingRef = admin.firestore().collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!bookingDoc.exists) {
            res.status(404).json({error: 'Booking not found'});
            return;
        }

        const bookingData = bookingDoc.data();

        await bookingRef.update({
            selectedDate,
            selectedTime,
            selectedServices,
            notes,
            totalPrice,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await logEmail('booking_updated_customer', bookingData.userEmail, {
            subject: 'Your Appointment Has Been Updated',
            bookingId,
            userName: bookingData.userName,
            selectedDate,
            selectedTime,
            totalPrice
        });

        await logEmail('booking_updated_shop', bookingData.shopEmail, {
            subject: `Booking Updated - ID: ${bookingId}`,
            bookingId,
            userName: bookingData.userName,
            selectedDate,
            selectedTime
        });

        res.status(200).json({message: 'Booking updated successfully'});
    } catch (error) {
        console.error('[updateBooking] Error:', error);
        res.status(500).json({error: 'Error updating booking'});
    }
});

exports.cancelBooking = functions.https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    const { bookingId, reason } = req.body;

    try {
        const bookingRef = admin.firestore().collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!bookingDoc.exists) {
            res.status(404).json({error: 'Booking not found'});
            return;
        }

        const bookingData = bookingDoc.data();

        await bookingRef.update({
            status: 'cancelled',
            cancellationReason: reason,
            cancelledAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await logEmail('booking_cancelled_customer', bookingData.userEmail, {
            subject: 'Your Appointment Has Been Cancelled',
            bookingId,
            userName: bookingData.userName,
            selectedDate: bookingData.selectedDate,
            selectedTime: bookingData.selectedTime
        });

        await logEmail('booking_cancelled_shop', bookingData.shopEmail, {
            subject: `Booking Cancelled - ID: ${bookingId}`,
            bookingId,
            userName: bookingData.userName,
            selectedDate: bookingData.selectedDate,
            selectedTime: bookingData.selectedTime
        });

        res.status(200).json({message: 'Booking cancelled successfully'});
    } catch (error) {
        console.error('[cancelBooking] Error:', error);
        res.status(500).json({error: 'Error cancelling booking'});
    }
});

exports.onNewMessage = functions.firestore
    .document('messages/{messageId}')
    .onCreate(async (snap, context) => {
        const message = snap.data();
        console.log(`[onNewMessage] New message in conversation ${message.bookingId}`);

        try {
            const receiverDoc = await admin.firestore()
                .collection('users')
                .doc(message.receiverId || message.shopId)
                .get();

            if (receiverDoc.exists && receiverDoc.data().fcmToken) {
                await admin.messaging().send({
                    token: receiverDoc.data().fcmToken,
                    notification: {
                        title: `New message from ${message.senderType === 'shop' ? 'Shop' : 'Customer'}`,
                        body: message.content.slice(0, 100)
                    },
                    data: {
                        type: 'message',
                        bookingId: message.bookingId,
                        messageId: context.params.messageId
                    }
                }).catch(err => console.log('[FCM] Error sending push:', err));
            }

            if (receiverDoc.exists && receiverDoc.data().email) {
                await logEmail('new_message', receiverDoc.data().email, {
                    subject: 'New Message Regarding Your Appointment',
                    bookingId: message.bookingId
                });
            }

            return null;
        } catch (error) {
            console.error('[onNewMessage] Error:', error);
            return null;
        }
    });

exports.onNewRating = functions.firestore
    .document('ratings/{ratingId}')
    .onCreate(async (snap, context) => {
        const rating = snap.data();
        console.log(`[onNewRating] New rating for shop ${rating.shopId}`);

        try {
            const shopRef = admin.firestore().collection('barberShops').doc(rating.shopId);
            const shopDoc = await shopRef.get();

            if (shopDoc.exists) {
                const shopData = shopDoc.data();
                const ratings = shopData.ratings || [];
                ratings.push(rating.rating);

                const averageRating = ratings.reduce((a, b) => a + b) / ratings.length;

                await shopRef.update({
                    ratings,
                    averageRating: parseFloat(averageRating.toFixed(1)),
                    totalRatings: ratings.length
                });

                const ownerDoc = await admin.firestore()
                    .collection('users')
                    .doc(shopData.ownerId)
                    .get();

                if (ownerDoc.exists && ownerDoc.data().fcmToken) {
                    await admin.messaging().send({
                        token: ownerDoc.data().fcmToken,
                        notification: {
                            title: 'New Rating Received',
                            body: `You received a ${rating.rating}-star rating`
                        },
                        data: {
                            type: 'rating',
                            ratingId: context.params.ratingId,
                            shopId: rating.shopId
                        }
                    }).catch(err => console.log('[FCM] Error sending rating notification:', err));
                }
            }

            return null;
        } catch (error) {
            console.error('[onNewRating] Error:', error);
            return null;
        }
    });

exports.rescheduleAppointment = functions.https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    try {
        const { bookingId, newDate, newTime, reason, userId } = req.body;

        const bookingRef = admin.firestore().collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!bookingDoc.exists) {
            return res.status(404).json({error: 'Booking not found'});
        }

        const bookingData = bookingDoc.data();

        const existingBookingsQuery = await admin.firestore()
            .collection('bookings')
            .where('shopId', '==', bookingData.shopId)
            .where('selectedDate', '==', newDate)
            .where('selectedTime', '==', newTime)
            .where('status', 'in', ['confirmed', 'pending'])
            .get();

        if (!existingBookingsQuery.empty) {
            return res.status(400).json({error: 'Time slot is not available'});
        }

        await bookingRef.update({
            selectedDate: newDate,
            selectedTime: newTime,
            previousDate: bookingData.selectedDate,
            previousTime: bookingData.selectedTime,
            rescheduledAt: admin.firestore.FieldValue.serverTimestamp(),
            rescheduledBy: userId,
            reschedulingReason: reason,
            status: 'rescheduled'
        });

        await admin.firestore().collection('notifications').add({
            userId: bookingData.userEmail,
            type: 'reschedule',
            title: 'Appointment Rescheduled',
            message: `Your appointment has been rescheduled to ${newDate} at ${newTime}`,
            bookingId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false
        });

        await logEmail('booking_rescheduled_customer', bookingData.userEmail, {
            subject: 'Your Appointment Has Been Rescheduled',
            bookingId,
            userName: bookingData.userName,
            previousDate: bookingData.selectedDate,
            previousTime: bookingData.selectedTime,
            newDate,
            newTime
        });

        await logEmail('booking_rescheduled_shop', bookingData.shopEmail, {
            subject: `Booking Rescheduled - ID: ${bookingId}`,
            bookingId,
            userName: bookingData.userName,
            previousDate: bookingData.selectedDate,
            previousTime: bookingData.selectedTime,
            newDate,
            newTime
        });

        return res.status(200).json({message: 'Appointment rescheduled successfully'});
    } catch (error) {
        console.error('[rescheduleAppointment] Error:', error);
        return res.status(500).json({error: 'Internal server error'});
    }
});

exports.sendAppointmentNotifications = functions.pubsub
    .schedule('every 1 hours')
    .onRun(async (context) => {
        console.log('[sendAppointmentNotifications] Running scheduled task');
        return null;
    });

exports.sendDeletionConfirmationEmail = functions.firestore
    .document('deletedAccounts/{userId}')
    .onCreate(async (snap, context) => {
        const userData = snap.data();
        console.log(`[sendDeletionConfirmationEmail] Account deletion for ${userData.email}`);

        await logEmail('account_deletion', userData.email, {
            subject: 'Account Deletion Confirmation',
            userName: userData.displayName
        });

        await snap.ref.delete();
        return null;
    });

exports.respondToRating = functions.https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(204).send('');

    const { ratingId, response, shopId } = req.body;

    try {
        const ratingRef = admin.firestore().collection('ratings').doc(ratingId);
        const rating = await ratingRef.get();

        if (!rating.exists) {
            return res.status(404).json({error: 'Rating not found'});
        }

        await ratingRef.update({
            shopResponse: {
                content: response,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            }
        });

        await admin.firestore().collection('notifications').add({
            userId: rating.data().userId,
            type: 'rating_response',
            title: 'Shop Responded to Your Review',
            message: response.slice(0, 100) + '...',
            ratingId,
            shopId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false
        });

        res.status(200).json({message: 'Response added successfully'});
    } catch (error) {
        console.error('[respondToRating] Error:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

exports.shopMessage = functions.https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(204).send('');

    const {
        bookingId,
        content,
        senderId,
        senderType,
        shopId,
        customerId,
        customerName,
        shopName,
        appointmentDetails
    } = req.body;

    try {
        if (!bookingId || !content || !senderId || !shopId || !customerId) {
            return res.status(400).json({error: 'Missing required fields'});
        }

        const messageRef = await admin.firestore().collection('messages').add({
            bookingId,
            content,
            senderId,
            senderType,
            shopId,
            customerId,
            customerName,
            shopName,
            appointmentDetails: {
                date: appointmentDetails?.date,
                time: appointmentDetails?.time,
                services: appointmentDetails?.services || [],
                totalPrice: appointmentDetails?.totalPrice || 0
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            read: false
        });

        await admin.firestore().collection('notifications').add({
            userId: senderType === 'customer' ? shopId : customerId,
            type: 'new_message',
            title: `New message from ${senderType === 'customer' ? customerName : shopName}`,
            message: content.slice(0, 100) + (content.length > 100 ? '...' : ''),
            bookingId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false
        });

        const receiverId = senderType === 'customer' ? shopId : customerId;
        const receiverDoc = await admin.firestore()
            .collection('users')
            .doc(receiverId)
            .get();

        if (receiverDoc.exists && receiverDoc.data().fcmToken) {
            await admin.messaging().send({
                token: receiverDoc.data().fcmToken,
                notification: {
                    title: `New message from ${senderType === 'customer' ? customerName : shopName}`,
                    body: content.slice(0, 100)
                },
                data: {
                    type: 'message',
                    bookingId,
                    messageId: messageRef.id
                }
            }).catch(err => console.log('[FCM] Error sending message notification:', err));
        }

        if (receiverDoc.exists && receiverDoc.data().email) {
            await logEmail('new_message', receiverDoc.data().email, {
                subject: 'New Message Regarding Your Appointment',
                bookingId
            });
        }

        res.status(200).json({
            success: true,
            messageId: messageRef.id
        });
    } catch (error) {
        console.error('[shopMessage] Error:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

exports.onStatusChange = functions.firestore
    .document('bookings/{bookingId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const previousData = change.before.data();

        if (newData.status === previousData.status) {
            return null;
        }

        console.log(`[onStatusChange] Booking ${context.params.bookingId} status: ${previousData.status} -> ${newData.status}`);

        try {
            await admin.firestore().collection('notifications').add({
                userId: newData.userEmail,
                type: 'status_update',
                title: 'Appointment Status Updated',
                message: `Your appointment status has been updated to ${newData.status}`,
                bookingId: context.params.bookingId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false
            });

            await logEmail('status_update', newData.userEmail, {
                subject: 'Appointment Status Update',
                bookingId: context.params.bookingId,
                userName: newData.userName,
                status: newData.status,
                selectedDate: newData.selectedDate,
                selectedTime: newData.selectedTime
            });

            return null;
        } catch (error) {
            console.error('[onStatusChange] Error:', error);
            return null;
        }
    });

exports.updateFCMToken = functions.https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') return res.status(204).send('');

    const { userId, token } = req.body;

    try {
        await admin.firestore()
            .collection('users')
            .doc(userId)
            .update({
                fcmToken: token,
                tokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

        res.status(200).json({message: 'Token updated successfully'});
    } catch (error) {
        console.error('[updateFCMToken] Error:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});
