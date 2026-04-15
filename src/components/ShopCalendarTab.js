import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    doc,
    updateDoc,
    Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    Calendar,
    Clock,
    User,
    DollarSign,
    CheckCircle,
    XCircle,
    MessageCircle,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Eye,
    MoreVertical
} from 'lucide-react';
import ShopOwnerBookingModal from './ShopOwnerBookingModal';
import { useShopBookings, useBookingActions } from '../hooks/useBookings';
import { BOOKING_STATUS, normalizeBookingData } from '../Services/bookingService';

const ShopCalendarTab = ({ shop, user }) => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState('day');
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [statsExpanded, setStatsExpanded] = useState(false);

    const { bookings, loading, filter, updateFilter, stats } = useShopBookings(shop?.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getDateBookings = useMemo(() => {
        const dateStr = selectedDate.toISOString().split('T')[0];
        return bookings.filter(b => b.selectedDate === dateStr);
    }, [bookings, selectedDate]);

    const generateTimeSlots = () => {
        if (!shop?.availability) return [];

        const dayOfWeek = selectedDate.toLocaleString('en-US', { weekday: 'long' });
        const availability = shop.availability[dayOfWeek];

        if (!availability || !availability.open || !availability.close) {
            return [];
        }

        const slots = [];
        const [openHour, openMinute] = availability.open.split(':').map(Number);
        const [closeHour, closeMinute] = availability.close.split(':').map(Number);

        let currentMinutes = openHour * 60 + openMinute;
        const endMinutes = closeHour * 60 + closeMinute;

        while (currentMinutes < endMinutes) {
            const hour = Math.floor(currentMinutes / 60);
            const minute = currentMinutes % 60;
            slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
            currentMinutes += 30;
        }

        return slots;
    };

    const timeSlots = generateTimeSlots();

    const getAppointmentsForTimeSlot = (timeSlot) => {
        return getDateBookings.filter(appointment => appointment.selectedTime === timeSlot);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case BOOKING_STATUS.CONFIRMED:
                return 'bg-success/20 border-l-4 border-success';
            case BOOKING_STATUS.CANCELLED:
                return 'bg-error/20 border-l-4 border-error';
            case BOOKING_STATUS.COMPLETED:
                return 'bg-info/20 border-l-4 border-info';
            case BOOKING_STATUS.PENDING:
                return 'bg-warning/20 border-l-4 border-warning';
            case BOOKING_STATUS.NO_SHOW:
                return 'bg-base-300/50 border-l-4 border-base-content/30';
            case BOOKING_STATUS.RESCHEDULED:
                return 'bg-secondary/20 border-l-4 border-secondary';
            default:
                return 'bg-base-200 border-l-4 border-base-300';
        }
    };

    const handleBookingClick = (booking) => {
        setSelectedBooking(booking);
        setShowBookingModal(true);
    };

    const handleBookingUpdate = () => {
        setShowBookingModal(false);
        setSelectedBooking(null);
    };

    const navigateDate = (direction) => {
        const newDate = new Date(selectedDate);
        if (direction === 'prev') {
            newDate.setDate(newDate.getDate() - (view === 'day' ? 1 : view === 'week' ? 7 : 30));
        } else {
            newDate.setDate(newDate.getDate() + (view === 'day' ? 1 : view === 'week' ? 7 : 30));
        }
        setSelectedDate(newDate);
    };

    const goToToday = () => {
        setSelectedDate(new Date());
    };

    if (loading && isLoading) {
        return (
            <div className="h-64 flex items-center justify-center">
                <div className="loading loading-spinner text-primary loading-lg"></div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <button
                            className="btn btn-sm btn-circle"
                            onClick={() => navigateDate('prev')}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="text-center min-w-[200px]">
                            <h3 className="text-lg font-bold">
                                {view === 'day' && selectedDate.toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                                {view === 'week' && `Week of ${selectedDate.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric'
                                })}`}
                                {view === 'month' && selectedDate.toLocaleDateString('en-US', {
                                    month: 'long',
                                    year: 'numeric'
                                })}
                            </h3>
                        </div>

                        <button
                            className="btn btn-sm btn-circle"
                            onClick={() => navigateDate('next')}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        className="btn btn-sm btn-outline"
                        onClick={goToToday}
                    >
                        Today
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="join">
                        {['day', 'week', 'month'].map(v => (
                            <button
                                key={v}
                                className={`join-item btn btn-sm ${view === v ? 'btn-active' : 'btn-outline'}`}
                                onClick={() => setView(v)}
                            >
                                {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                        ))}
                    </div>

                    <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setStatsExpanded(!statsExpanded)}
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <motion.div
                initial={false}
                animate={{ height: statsExpanded ? 'auto' : 0, opacity: statsExpanded ? 1 : 0 }}
                className="overflow-hidden mb-4"
            >
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 p-4 bg-base-200 rounded-lg">
                    <div className="stat py-2">
                        <div className="stat-title text-xs">Pending</div>
                        <div className="stat-value text-xl text-warning">{stats.pending}</div>
                    </div>
                    <div className="stat py-2">
                        <div className="stat-title text-xs">Confirmed</div>
                        <div className="stat-value text-xl text-success">{stats.confirmed}</div>
                    </div>
                    <div className="stat py-2">
                        <div className="stat-title text-xs">Today</div>
                        <div className="stat-value text-xl text-primary">{stats.todayTotal}</div>
                    </div>
                    <div className="stat py-2">
                        <div className="stat-title text-xs">Completed</div>
                        <div className="stat-value text-xl text-info">{stats.completed}</div>
                    </div>
                    <div className="stat py-2">
                        <div className="stat-title text-xs">Cancelled</div>
                        <div className="stat-value text-xl text-error">{stats.cancelled}</div>
                    </div>
                    <div className="stat py-2">
                        <div className="stat-title text-xs">Revenue</div>
                        <div className="stat-value text-xl text-success">тВм{stats.revenue.toFixed(0)}</div>
                    </div>
                </div>
            </motion.div>

            <div className="flex-1 overflow-auto">
                {view === 'day' && (
                    <div className="space-y-1">
                        {timeSlots.length === 0 ? (
                            <div className="text-center py-12 text-base-content/60">
                                <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                                <p>No working hours set for this day</p>
                            </div>
                        ) : (
                            timeSlots.map(timeSlot => {
                                const slotAppointments = getAppointmentsForTimeSlot(timeSlot);

                                return (
                                    <div key={timeSlot} className="flex gap-2 min-h-[60px] border-t border-base-200">
                                        <div className="w-20 py-2 text-sm text-base-content/60 flex-shrink-0">
                                            {timeSlot}
                                        </div>
                                        <div className="flex-1 py-1 space-y-1">
                                            {slotAppointments.length === 0 ? (
                                                <div className="h-10 flex items-center justify-center text-xs text-base-content/30">
                                                    -
                                                </div>
                                            ) : (
                                                slotAppointments.map(appointment => (
                                                    <motion.div
                                                        key={appointment.id}
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        className={`
                                                            p-2 rounded-lg cursor-pointer
                                                            ${getStatusColor(appointment.status)}
                                                            hover:shadow-md transition-shadow
                                                        `}
                                                        onClick={() => handleBookingClick(appointment)}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="font-medium text-sm truncate">
                                                                {appointment.userName}
                                                            </div>
                                                            <span className={`badge badge-xs ${
                                                                appointment.status === BOOKING_STATUS.CONFIRMED ? 'badge-success' :
                                                                appointment.status === BOOKING_STATUS.PENDING ? 'badge-warning' :
                                                                appointment.status === BOOKING_STATUS.CANCELLED ? 'badge-error' :
                                                                'badge-ghost'
                                                            }`}>
                                                                {appointment.status}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-base-content/60 truncate">
                                                            {appointment.selectedServices?.map(s => s.name).join(', ')}
                                                        </div>
                                                        {appointment.employeeName && (
                                                            <div className="text-xs text-base-content/40">
                                                                {appointment.employeeName}
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {view !== 'day' && (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-warning" />
                            <p className="font-medium mb-1">{view.charAt(0).toUpperCase() + view.slice(1)} view</p>
                            <p className="text-sm text-base-content/60">Using day view for detailed management</p>
                        </div>
                    </div>
                )}
            </div>

            <ShopOwnerBookingModal
                booking={selectedBooking}
                isOpen={showBookingModal}
                onClose={() => {
                    setShowBookingModal(false);
                    setSelectedBooking(null);
                }}
                shop={shop}
                onUpdate={handleBookingUpdate}
            />
        </div>
    );
};

export default ShopCalendarTab;
