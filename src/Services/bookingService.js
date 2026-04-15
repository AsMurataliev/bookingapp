import {db} from '../firebase';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    updateDoc,
    addDoc,
    serverTimestamp,
    Timestamp,
    writeBatch,
    onSnapshot
} from 'firebase/firestore';

export const BOOKING_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    NO_SHOW: 'no_show',
    RESCHEDULED: 'rescheduled'
};

export const BOOKING_COLLECTION = 'bookings';
export const BOOKED_SLOTS_COLLECTION = 'bookedTimeSlots';

export const normalizeBookingData = (doc) => {
    const data = doc.data();
    return {
        id: doc.id,
        ...data,
        selectedDate: data.selectedDate || data.date,
        selectedTime: data.selectedTime || data.time,
        date: data.selectedDate || data.date,
        time: data.selectedTime || data.time,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
        cancelledAt: data.cancelledAt?.toDate ? data.cancelledAt.toDate() : (data.cancelledAt ? new Date(data.cancelledAt) : null),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : null)
    };
};

export const createBooking = async (bookingData) => {
    const bookingsRef = collection(db, BOOKING_COLLECTION);

    const booking = {
        shopId: bookingData.shopId,
        shopEmail: bookingData.shopEmail,
        shopOwnerId: bookingData.shopOwnerId,
        userName: bookingData.userName,
        userEmail: bookingData.userEmail.toLowerCase(),
        userPhone: bookingData.userPhone,
        selectedDate: bookingData.selectedDate,
        selectedTime: bookingData.selectedTime,
        date: bookingData.selectedDate,
        time: bookingData.selectedTime,
        selectedServices: bookingData.selectedServices,
        customService: bookingData.customService || '',
        totalPrice: bookingData.totalPrice,
        status: BOOKING_STATUS.PENDING,
        employeeId: bookingData.employeeId || null,
        employeeName: bookingData.employeeName || null,
        notes: bookingData.notes || '',
        timeSlotId: bookingData.timeSlotId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(bookingsRef, booking);
    return { id: docRef.id, ...booking };
};

export const checkSlotAvailability = async (shopId, date, time, excludeBookingId = null, employeeId = null) => {
    const bookedTimeSlotsRef = collection(db, BOOKED_SLOTS_COLLECTION);

    let timeSlotQuery = query(
        bookedTimeSlotsRef,
        where('shopId', '==', shopId),
        where('date', '==', date),
        where('time', '==', time),
        where('status', 'in', ['booked', 'pending'])
    );

    if (employeeId) {
        timeSlotQuery = query(
            bookedTimeSlotsRef,
            where('shopId', '==', shopId),
            where('date', '==', date),
            where('time', '==', time),
            where('employeeId', '==', employeeId),
            where('status', 'in', ['booked', 'pending'])
        );
    }

    const existingSlots = await getDocs(timeSlotQuery);

    if (!existingSlots.empty) {
        const slot = existingSlots.docs[0];
        if (excludeBookingId && slot.data().bookingId === excludeBookingId) {
            return { available: true, slotId: null };
        }
        return { available: false, slotId: slot.id, reason: 'Slot already booked' };
    }

    return { available: true, slotId: null };
};

export const reserveTimeSlot = async (shopId, date, time, bookingId, employeeId = null, employeeName = null) => {
    const bookedTimeSlotsRef = collection(db, BOOKED_SLOTS_COLLECTION);

    const slotData = {
        shopId,
        date,
        time,
        status: 'pending',
        bookingId,
        employeeId,
        employeeName,
        createdAt: serverTimestamp()
    };

    const docRef = await addDoc(bookedTimeSlotsRef, slotData);
    return docRef.id;
};

export const confirmTimeSlot = async (slotId) => {
    const slotRef = doc(db, BOOKED_SLOTS_COLLECTION, slotId);
    await updateDoc(slotRef, { status: 'booked' });
};

export const cancelTimeSlot = async (slotId) => {
    const slotRef = doc(db, BOOKED_SLOTS_COLLECTION, slotId);
    await updateDoc(slotRef, { status: 'cancelled' });
};

export const updateBookingStatus = async (bookingId, newStatus, additionalData = {}) => {
    const bookingRef = doc(db, BOOKING_COLLECTION, bookingId);

    const updateData = {
        status: newStatus,
        updatedAt: serverTimestamp(),
        ...additionalData
    };

    if (newStatus === BOOKING_STATUS.CANCELLED) {
        updateData.cancelledAt = serverTimestamp();
    }

    if (newStatus === BOOKING_STATUS.COMPLETED) {
        updateData.completedAt = serverTimestamp();
    }

    if (newStatus === BOOKING_STATUS.NO_SHOW) {
        updateData.noShowAt = serverTimestamp();
    }

    await updateDoc(bookingRef, updateData);
    return true;
};

export const rescheduleBooking = async (bookingId, newDate, newTime, reason = '', rescheduledBy = 'customer') => {
    const bookingRef = doc(db, BOOKING_COLLECTION, bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
        throw new Error('Booking not found');
    }

    const bookingData = bookingSnap.data();

    const previousDate = bookingData.selectedDate || bookingData.date;
    const previousTime = bookingData.selectedTime || bookingData.time;

    const updateData = {
        selectedDate: newDate,
        selectedTime: newTime,
        date: newDate,
        time: newTime,
        status: BOOKING_STATUS.RESCHEDULED,
        previousDate,
        previousTime,
        reschedulingReason: reason,
        rescheduledBy,
        rescheduledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    await updateDoc(bookingRef, updateData);

    if (bookingData.timeSlotId) {
        await cancelTimeSlot(bookingData.timeSlotId);
    }

    const newSlotId = await reserveTimeSlot(
        bookingId,
        newDate,
        newTime,
        bookingId,
        bookingData.employeeId,
        bookingData.employeeName
    );

    await updateDoc(bookingRef, { timeSlotId: newSlotId });

    return true;
};

export const confirmBooking = async (bookingId, message = '') => {
    await updateBookingStatus(bookingId, BOOKING_STATUS.CONFIRMED);

    const notificationData = {
        type: 'booking_confirmed',
        bookingId,
        createdAt: serverTimestamp(),
        read: false
    };

    await addDoc(collection(db, 'notifications'), notificationData);

    if (message) {
        await addDoc(collection(db, 'messages'), {
            bookingId,
            senderType: 'shop',
            content: message,
            timestamp: serverTimestamp(),
            read: false
        });
    }

    return true;
};

export const cancelBooking = async (bookingId, reason, cancelledBy = 'customer') => {
    const bookingRef = doc(db, BOOKING_COLLECTION, bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
        throw new Error('Booking not found');
    }

    const bookingData = bookingSnap.data();

    await updateBookingStatus(bookingId, BOOKING_STATUS.CANCELLED, {
        cancellationReason: reason,
        cancelledBy
    });

    if (bookingData.timeSlotId) {
        await cancelTimeSlot(bookingData.timeSlotId);
    }

    await addDoc(collection(db, 'notifications'), {
        type: 'booking_cancelled',
        bookingId,
        shopId: bookingData.shopId,
        userEmail: bookingData.userEmail,
        title: 'Booking Cancelled',
        message: `Booking for ${new Date(bookingData.selectedDate).toLocaleDateString()} at ${bookingData.selectedTime} has been cancelled. Reason: ${reason}`,
        createdAt: serverTimestamp(),
        read: false
    });

    return true;
};

export const completeBooking = async (bookingId, notes = '') => {
    await updateBookingStatus(bookingId, BOOKING_STATUS.COMPLETED, { completionNotes: notes });
    return true;
};

export const markNoShow = async (bookingId, reason = '') => {
    await updateBookingStatus(bookingId, BOOKING_STATUS.NO_SHOW, { noShowReason: reason });
    return true;
};

export const fetchShopBookings = async (shopId, options = {}) => {
    const {
        status = null,
        startDate = null,
        endDate = null,
        limit = 100
    } = options;

    let q = query(
        collection(db, BOOKING_COLLECTION),
        where('shopId', '==', shopId),
        orderBy('selectedDate', 'desc'),
        orderBy('selectedTime', 'desc')
    );

    if (status) {
        q = query(
            collection(db, BOOKING_COLLECTION),
            where('shopId', '==', shopId),
            where('status', '==', status),
            orderBy('selectedDate', 'desc'),
            orderBy('selectedTime', 'desc')
        );
    }

    const snapshot = await getDocs(q);
    let bookings = snapshot.docs.map(normalizeBookingData);

    if (startDate) {
        bookings = bookings.filter(b => new Date(b.selectedDate) >= new Date(startDate));
    }
    if (endDate) {
        bookings = bookings.filter(b => new Date(b.selectedDate) <= new Date(endDate));
    }

    return bookings.slice(0, limit);
};

export const fetchCustomerBookings = async (userEmail) => {
    const q = query(
        collection(db, BOOKING_COLLECTION),
        where('userEmail', '==', userEmail.toLowerCase()),
        orderBy('selectedDate', 'desc'),
        orderBy('selectedTime', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(normalizeBookingData);
};

export const fetchBookingById = async (bookingId) => {
    const bookingRef = doc(db, BOOKING_COLLECTION, bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
        return null;
    }

    return normalizeBookingData(bookingSnap);
};

export const subscribeToShopBookings = (shopId, callback, options = {}) => {
    const { status = null } = options;

    let q = query(
        collection(db, BOOKING_COLLECTION),
        where('shopId', '==', shopId),
        orderBy('selectedDate', 'desc'),
        orderBy('selectedTime', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
        let bookings = snapshot.docs.map(normalizeBookingData);

        if (status) {
            bookings = bookings.filter(b => b.status === status);
        }

        callback(bookings);
    });
};

export const subscribeToCustomerBookings = (userEmail, callback) => {
    const q = query(
        collection(db, BOOKING_COLLECTION),
        where('userEmail', '==', userEmail.toLowerCase()),
        orderBy('selectedDate', 'desc'),
        orderBy('selectedTime', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
        const bookings = snapshot.docs.map(normalizeBookingData);
        callback(bookings);
    });
};

export const getAvailableTimeSlots = async (shopId, date, employeeId = null) => {
    const shopDoc = await getDoc(doc(db, 'barberShops', shopId));

    if (!shopDoc.exists()) {
        return [];
    }

    const shopData = shopDoc.data();
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', {weekday: 'long'});
    const dayAvailability = shopData.availability?.[dayOfWeek];

    if (!dayAvailability || !dayAvailability.open || !dayAvailability.close) {
        return [];
    }

    const slots = generateTimeSlots(dayAvailability.open, dayAvailability.close, 30);

    const bookedSlotsQuery = query(
        collection(db, BOOKED_SLOTS_COLLECTION),
        where('shopId', '==', shopId),
        where('date', '==', date),
        where('status', 'in', ['booked', 'pending'])
    );

    if (employeeId) {
        const employeeBookedQuery = query(
            collection(db, BOOKED_SLOTS_COLLECTION),
            where('shopId', '==', shopId),
            where('date', '==', date),
            where('employeeId', '==', employeeId),
            where('status', 'in', ['booked', 'pending'])
        );
        const employeeSnap = await getDocs(employeeBookedQuery);
        const employeeBooked = employeeSnap.docs.map(d => d.data().time);
        return slots.filter(slot => !employeeBooked.includes(slot));
    }

    const bookedSnap = await getDocs(bookedSlotsQuery);
    const bookedTimes = bookedSnap.docs.map(d => d.data().time);

    return slots.filter(slot => !bookedTimes.includes(slot));
};

export const generateTimeSlots = (open, close, intervalMinutes = 30) => {
    const slots = [];
    const [openHour, openMinute] = open.split(':').map(Number);
    const [closeHour, closeMinute] = close.split(':').map(Number);

    let currentMinutes = openHour * 60 + openMinute;
    const endMinutes = closeHour * 60 + closeMinute;

    while (currentMinutes < endMinutes) {
        const hour = Math.floor(currentMinutes / 60);
        const minute = currentMinutes % 60;
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
        currentMinutes += intervalMinutes;
    }

    return slots;
};

export const validateBookingOverlap = async (shopId, date, startTime, endTime, excludeBookingId = null, employeeId = null) => {
    const q = query(
        collection(db, BOOKING_COLLECTION),
        where('shopId', '==', shopId),
        where('selectedDate', '==', date),
        where('status', 'in', [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED])
    );

    const snapshot = await getDocs(q);
    const bookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    for (const booking of bookings) {
        if (excludeBookingId && booking.id === excludeBookingId) {
            continue;
        }

        if (employeeId && booking.employeeId !== employeeId) {
            continue;
        }

        const bookingStart = booking.selectedTime;
        const bookingEnd = calculateEndTime(booking.selectedTime, getTotalDuration(booking.selectedServices));

        if (timesOverlap(startTime, endTime, bookingStart, bookingEnd)) {
            return {
                valid: false,
                conflictingBooking: booking,
                message: 'Time slot overlaps with an existing booking'
            };
        }
    }

    return { valid: true };
};

const timesOverlap = (start1, end1, start2, end2) => {
    const toMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    };

    const s1 = toMinutes(start1);
    const e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    const e2 = toMinutes(end2);

    return s1 < e2 && s2 < e1;
};

const calculateEndTime = (startTime, durationMinutes) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
};

const getTotalDuration = (services) => {
    if (!services || services.length === 0) return 30;
    return services.reduce((total, service) => total + (parseInt(service.duration) || 30), 0);
};

export default {
    BOOKING_STATUS,
    BOOKING_COLLECTION,
    BOOKED_SLOTS_COLLECTION,
    normalizeBookingData,
    createBooking,
    checkSlotAvailability,
    reserveTimeSlot,
    confirmTimeSlot,
    cancelTimeSlot,
    updateBookingStatus,
    rescheduleBooking,
    confirmBooking,
    cancelBooking,
    completeBooking,
    markNoShow,
    fetchShopBookings,
    fetchCustomerBookings,
    fetchBookingById,
    subscribeToShopBookings,
    subscribeToCustomerBookings,
    getAvailableTimeSlots,
    generateTimeSlots,
    validateBookingOverlap
};
