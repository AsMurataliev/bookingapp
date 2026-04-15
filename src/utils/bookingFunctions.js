import {db} from '../firebase';
import {
    doc,
    updateDoc,
    collection,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';

export const updateBooking = async (bookingId, updatedData) => {
    try {
        const bookingRef = doc(db, 'bookings', bookingId);
        await updateDoc(bookingRef, {
            ...updatedData,
            lastModified: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
        return true;
    } catch (error) {
        console.error('Error updating booking:', error);
        throw error;
    }
};

export const getAvailableTimeSlots = async (shopId, date, employeeId = null) => {
    try {
        if (!shopId) {
            return [
                "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
                "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
                "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"
            ];
        }

        const shopDoc = await getDoc(doc(db, 'barberShops', shopId));

        if (!shopDoc.exists()) {
            return [
                "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
                "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
                "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"
            ];
        }

        const shopData = shopDoc.data();

        if (!shopData.availability) {
            return [
                "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
                "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
                "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"
            ];
        }

        const dateObj = date instanceof Date ? date : new Date(date);
        const dayOfWeek = dateObj.toLocaleDateString('en-US', {weekday: 'long'});
        const workingHours = shopData.availability[dayOfWeek];

        if (!workingHours || !workingHours.open || !workingHours.close) {
            return [
                "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
                "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
                "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"
            ];
        }

        const slots = [];
        const [startHour, startMinute] = workingHours.open.split(':').map(Number);
        const [endHour, endMinute] = workingHours.close.split(':').map(Number);

        let currentMinutes = startHour * 60 + startMinute;
        const endMinutes = endHour * 60 + endMinute;

        while (currentMinutes < endMinutes) {
            const hour = Math.floor(currentMinutes / 60);
            const minute = currentMinutes % 60;
            slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
            currentMinutes += 30;
        }

        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

        const bookingsRef = collection(db, 'bookings');
        let bookingsQuery = query(
            bookingsRef,
            where('shopId', '==', shopId),
            where('selectedDate', '==', dateStr),
            where('status', 'in', ['pending', 'confirmed'])
        );

        const bookings = await getDocs(bookingsQuery);
        const bookedTimes = new Set();

        bookings.docs.forEach(doc => {
            const bookingData = doc.data();
            if (!employeeId || bookingData.employeeId === employeeId) {
                bookedTimes.add(bookingData.selectedTime || bookingData.time);
            }
        });

        const bookedTimeSlotsRef = collection(db, 'bookedTimeSlots');
        let timeSlotsQuery = query(
            bookedTimeSlotsRef,
            where('shopId', '==', shopId),
            where('date', '==', dateStr),
            where('status', 'in', ['booked', 'pending'])
        );

        if (employeeId) {
            timeSlotsQuery = query(
                bookedTimeSlotsRef,
                where('shopId', '==', shopId),
                where('date', '==', dateStr),
                where('employeeId', '==', employeeId),
                where('status', 'in', ['booked', 'pending'])
            );
        }

        const timeSlots = await getDocs(timeSlotsQuery);
        timeSlots.docs.forEach(doc => {
            bookedTimes.add(doc.data().time);
        });

        return slots.filter(slot => !bookedTimes.has(slot));
    } catch (error) {
        console.error('Error getting available slots:', error);
        return [
            "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
            "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
            "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"
        ];
    }
};

export const fetchBookings = async (shopId) => {
    try {
        const bookingsRef = collection(db, 'bookings');
        const q = query(
            bookingsRef,
            where('shopId', '==', shopId),
            orderBy('selectedDate', 'desc'),
            orderBy('selectedTime', 'desc')
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                selectedDate: data.selectedDate || data.date,
                selectedTime: data.selectedTime || data.time,
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error fetching bookings:', error);
        throw error;
    }
};

export const cancelBooking = async (bookingId, reason, cancelledBy = 'customer') => {
    try {
        const bookingRef = doc(db, 'bookings', bookingId);
        const bookingSnap = await getDoc(bookingRef);

        if (!bookingSnap.exists()) {
            throw new Error('Booking not found');
        }

        const bookingData = bookingSnap.data();

        await updateDoc(bookingRef, {
            status: 'cancelled',
            cancellationReason: reason,
            cancelledBy,
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        if (bookingData.timeSlotId) {
            const slotRef = doc(db, 'bookedTimeSlots', bookingData.timeSlotId);
            await updateDoc(slotRef, { status: 'cancelled' });
        }

        return true;
    } catch (error) {
        console.error('Error cancelling booking:', error);
        throw error;
    }
};

export const confirmBooking = async (bookingId, message = '') => {
    try {
        const bookingRef = doc(db, 'bookings', bookingId);
        await updateDoc(bookingRef, {
            status: 'confirmed',
            confirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('Error confirming booking:', error);
        throw error;
    }
};

export const completeBooking = async (bookingId, notes = '') => {
    try {
        const bookingRef = doc(db, 'bookings', bookingId);
        await updateDoc(bookingRef, {
            status: 'completed',
            completedAt: serverTimestamp(),
            completionNotes: notes,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('Error completing booking:', error);
        throw error;
    }
};

export default {
    updateBooking,
    getAvailableTimeSlots,
    fetchBookings,
    cancelBooking,
    confirmBooking,
    completeBooking
};
