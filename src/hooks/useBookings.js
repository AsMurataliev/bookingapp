import { useState, useEffect, useCallback } from 'react';
import {
    fetchBookingById,
    subscribeToShopBookings,
    confirmBooking,
    cancelBooking,
    completeBooking,
    markNoShow,
    rescheduleBooking,
    BOOKING_STATUS
} from '../Services/bookingService';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export const useShopBookings = (shopId, options = {}) => {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState({
        status: 'all',
        searchQuery: '',
        dateRange: null
    });

    useEffect(() => {
        if (!shopId) {
            setBookings([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const unsubscribe = subscribeToShopBookings(shopId, (newBookings) => {
            setBookings(newBookings);
            setLoading(false);
        }, options);

        return () => unsubscribe();
    }, [shopId, JSON.stringify(options)]);

    const filteredBookings = useCallback(() => {
        let result = [...bookings];

        if (filter.status !== 'all') {
            result = result.filter(b => b.status === filter.status);
        }

        if (filter.searchQuery) {
            const query = filter.searchQuery.toLowerCase();
            result = result.filter(b =>
                b.userName?.toLowerCase().includes(query) ||
                b.userEmail?.toLowerCase().includes(query) ||
                b.selectedServices?.some(s => s.name.toLowerCase().includes(query))
            );
        }

        if (filter.dateRange?.start) {
            result = result.filter(b => new Date(b.selectedDate) >= new Date(filter.dateRange.start));
        }
        if (filter.dateRange?.end) {
            result = result.filter(b => new Date(b.selectedDate) <= new Date(filter.dateRange.end));
        }

        return result;
    }, [bookings, filter]);

    const stats = useCallback(() => {
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        return {
            total: bookings.length,
            pending: bookings.filter(b => b.status === BOOKING_STATUS.PENDING).length,
            confirmed: bookings.filter(b => b.status === BOOKING_STATUS.CONFIRMED).length,
            completed: bookings.filter(b => b.status === BOOKING_STATUS.COMPLETED).length,
            cancelled: bookings.filter(b => b.status === BOOKING_STATUS.CANCELLED).length,
            noShow: bookings.filter(b => b.status === BOOKING_STATUS.NO_SHOW).length,
            todayTotal: bookings.filter(b => b.selectedDate === today).length,
            todayPending: bookings.filter(b => b.selectedDate === today && b.status === BOOKING_STATUS.PENDING).length,
            todayConfirmed: bookings.filter(b => b.selectedDate === today && b.status === BOOKING_STATUS.CONFIRMED).length,
            revenue: bookings
                .filter(b => b.status === BOOKING_STATUS.COMPLETED)
                .reduce((sum, b) => sum + (parseFloat(b.totalPrice) || 0), 0)
        };
    }, [bookings]);

    const updateFilter = useCallback((newFilter) => {
        setFilter(prev => ({ ...prev, ...newFilter }));
    }, []);

    return {
        bookings: filteredBookings(),
        allBookings: bookings,
        loading,
        error,
        filter,
        updateFilter,
        stats: stats()
    };
};

export const useBookingActions = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleConfirm = useCallback(async (bookingId, message = '') => {
        setLoading(true);
        setError(null);
        try {
            await confirmBooking(bookingId, message);
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    const handleCancel = useCallback(async (bookingId, reason, cancelledBy = 'shop') => {
        setLoading(true);
        setError(null);
        try {
            await cancelBooking(bookingId, reason, cancelledBy);
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    const handleComplete = useCallback(async (bookingId, notes = '') => {
        setLoading(true);
        setError(null);
        try {
            await completeBooking(bookingId, notes);
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    const handleNoShow = useCallback(async (bookingId, reason = '') => {
        setLoading(true);
        setError(null);
        try {
            await markNoShow(bookingId, reason);
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    const handleReschedule = useCallback(async (bookingId, newDate, newTime, reason = '') => {
        setLoading(true);
        setError(null);
        try {
            await rescheduleBooking(bookingId, newDate, newTime, reason, 'shop');
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        error,
        confirmBooking: handleConfirm,
        cancelBooking: handleCancel,
        completeBooking: handleComplete,
        markNoShow: handleNoShow,
        rescheduleBooking: handleReschedule
    };
};

export const useBookingById = (bookingId) => {
    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!bookingId) {
            setBooking(null);
            setLoading(false);
            return;
        }

        const loadBooking = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await fetchBookingById(bookingId);
                setBooking(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadBooking();
    }, [bookingId]);

    return { booking, loading, error };
};

export const useCustomerBookings = () => {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (!currentUser) {
                setBookings([]);
                setLoading(false);
                return;
            }

            try {
                const { subscribeToCustomerBookings } = await import('../Services/bookingService');

                const unsubscribeSub = subscribeToCustomerBookings(
                    currentUser.email,
                    (newBookings) => {
                        setBookings(newBookings);
                        setLoading(false);
                    }
                );

                return () => unsubscribeSub();
            } catch (err) {
                console.error('Error loading customer bookings:', err);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const filteredBookings = useCallback((filter) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return bookings.filter(booking => {
            const appointmentDate = new Date(booking.selectedDate);
            appointmentDate.setHours(0, 0, 0, 0);

            switch (filter) {
                case 'upcoming':
                    return appointmentDate >= now &&
                           booking.status !== BOOKING_STATUS.CANCELLED &&
                           booking.status !== BOOKING_STATUS.NO_SHOW;
                case 'past':
                    return appointmentDate < now &&
                           booking.status !== BOOKING_STATUS.CANCELLED &&
                           booking.status !== BOOKING_STATUS.NO_SHOW;
                case 'cancelled':
                    return booking.status === BOOKING_STATUS.CANCELLED ||
                           booking.status === BOOKING_STATUS.NO_SHOW;
                default:
                    return true;
            }
        });
    }, [bookings]);

    return {
        bookings,
        filteredBookings,
        loading,
        user
    };
};

const bookingHooks = {
    useShopBookings,
    useBookingActions,
    useBookingById,
    useCustomerBookings
};

export default bookingHooks;
