import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar,
    Clock,
    User,
    Phone,
    Mail,
    Scissors,
    CheckCircle,
    XCircle,
    AlertTriangle,
    MessageCircle,
    UserX,
    Edit,
    ChevronLeft,
    ChevronRight,
    DollarSign
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useBookingActions } from '../hooks/useBookings';
import { BOOKING_STATUS, getAvailableTimeSlots, rescheduleBooking as apiReschedule } from '../Services/bookingService';
import { createRoot } from 'react-dom/client';

const ShopOwnerBookingModal = ({ booking, isOpen, onClose, shop, onUpdate }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedTime, setSelectedTime] = useState('');
    const [availableSlots, setAvailableSlots] = useState([]);
    const [message, setMessage] = useState('');
    const [showReschedule, setShowReschedule] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { confirmBooking, cancelBooking, completeBooking, markNoShow, rescheduleBooking } = useBookingActions();

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    useEffect(() => {
        if (showReschedule && selectedDate && shop) {
            loadAvailableSlots();
        }
    }, [selectedDate, showReschedule, shop]);

    const loadAvailableSlots = async () => {
        if (!shop || !selectedDate) return;

        try {
            const formattedDate = selectedDate.toISOString().split('T')[0];
            const slots = await getAvailableTimeSlots(shop.id, formattedDate, booking?.employeeId);
            setAvailableSlots(slots);
        } catch (error) {
            console.error('Error loading slots:', error);
        }
    };

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const days = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }

        for (let i = 1; i <= lastDay; i++) {
            days.push(new Date(year, month, i));
        }

        return days;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const handleConfirm = async () => {
        const result = await Swal.fire({
            title: 'Confirm Booking',
            text: 'Are you sure you want to confirm this booking?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Confirm',
            cancelButtonText: 'Cancel',
            input: 'textarea',
            inputPlaceholder: 'Add a message for the customer (optional)',
            inputValidator: (value) => null
        });

        if (result.isConfirmed) {
            setIsLoading(true);
            const res = await confirmBooking(booking.id, result.value || '');
            setIsLoading(false);

            if (res.success) {
                Swal.fire('Success', 'Booking confirmed successfully', 'success');
                onUpdate?.();
                onClose();
            } else {
                Swal.fire('Error', res.error || 'Failed to confirm booking', 'error');
            }
        }
    };

    const handleCancel = async () => {
        const result = await Swal.fire({
            title: 'Cancel Booking',
            text: 'Please provide a reason for cancellation:',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Cancel Booking',
            cancelButtonText: 'Keep Booking',
            input: 'textarea',
            inputPlaceholder: 'Cancellation reason...',
            inputValidator: (value) => {
                if (!value) return 'Please provide a reason';
            }
        });

        if (result.isConfirmed) {
            setIsLoading(true);
            const res = await cancelBooking(booking.id, result.value, 'shop');
            setIsLoading(false);

            if (res.success) {
                Swal.fire('Cancelled', 'Booking has been cancelled', 'success');
                onUpdate?.();
                onClose();
            } else {
                Swal.fire('Error', res.error || 'Failed to cancel booking', 'error');
            }
        }
    };

    const handleComplete = async () => {
        const result = await Swal.fire({
            title: 'Mark as Completed',
            text: 'Mark this booking as completed?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Complete',
            cancelButtonText: 'Cancel',
            input: 'textarea',
            inputPlaceholder: 'Add completion notes (optional)'
        });

        if (result.isConfirmed) {
            setIsLoading(true);
            const res = await completeBooking(booking.id, result.value || '');
            setIsLoading(false);

            if (res.success) {
                Swal.fire('Completed', 'Booking marked as completed', 'success');
                onUpdate?.();
                onClose();
            } else {
                Swal.fire('Error', res.error || 'Failed to complete booking', 'error');
            }
        }
    };

    const handleNoShow = async () => {
        const result = await Swal.fire({
            title: 'Mark as No-Show',
            text: 'Mark this customer as a no-show?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Mark No-Show',
            cancelButtonText: 'Cancel',
            input: 'textarea',
            inputPlaceholder: 'Reason or notes (optional)'
        });

        if (result.isConfirmed) {
            setIsLoading(true);
            const res = await markNoShow(booking.id, result.value || '');
            setIsLoading(false);

            if (res.success) {
                Swal.fire('Done', 'Customer marked as no-show', 'success');
                onUpdate?.();
                onClose();
            } else {
                Swal.fire('Error', res.error || 'Failed to mark no-show', 'error');
            }
        }
    };

    const handleReschedule = async () => {
        if (!selectedDate || !selectedTime) {
            Swal.fire('Error', 'Please select a date and time', 'error');
            return;
        }

        const formattedDate = selectedDate.toISOString().split('T')[0];

        const result = await Swal.fire({
            title: 'Reschedule Booking',
            text: `Reschedule to ${formattedDate} at ${selectedTime}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Reschedule',
            cancelButtonText: 'Cancel',
            input: 'textarea',
            inputPlaceholder: 'Reason for reschedule (optional)'
        });

        if (result.isConfirmed) {
            setIsLoading(true);
            const res = await rescheduleBooking(booking.id, formattedDate, selectedTime, result.value || '');
            setIsLoading(false);

            if (res.success) {
                Swal.fire('Rescheduled', 'Booking has been rescheduled', 'success');
                setShowReschedule(false);
                setSelectedDate(null);
                setSelectedTime('');
                onUpdate?.();
                onClose();
            } else {
                Swal.fire('Error', res.error || 'Failed to reschedule booking', 'error');
            }
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case BOOKING_STATUS.CONFIRMED:
                return 'bg-success/10 border-l-4 border-success text-success';
            case BOOKING_STATUS.CANCELLED:
                return 'bg-error/10 border-l-4 border-error text-error';
            case BOOKING_STATUS.COMPLETED:
                return 'bg-info/10 border-l-4 border-info text-info';
            case BOOKING_STATUS.PENDING:
                return 'bg-warning/10 border-l-4 border-warning text-warning';
            case BOOKING_STATUS.NO_SHOW:
                return 'bg-base-300/50 border-l-4 border-base-content/30 text-base-content/70';
            case BOOKING_STATUS.RESCHEDULED:
                return 'bg-secondary/10 border-l-4 border-secondary text-secondary';
            default:
                return 'bg-base-200 border-l-4 border-base-300';
        }
    };

    const getStatusBadge = (status) => {
        const colors = {
            [BOOKING_STATUS.PENDING]: 'badge-warning',
            [BOOKING_STATUS.CONFIRMED]: 'badge-success',
            [BOOKING_STATUS.CANCELLED]: 'badge-error',
            [BOOKING_STATUS.COMPLETED]: 'badge-info',
            [BOOKING_STATUS.NO_SHOW]: 'badge-neutral',
            [BOOKING_STATUS.RESCHEDULED]: 'badge-secondary'
        };
        return colors[status] || 'badge-ghost';
    };

    if (!booking) return null;

    const isPast = new Date(booking.selectedDate) < today;
    const isToday = booking.selectedDate === today.toISOString().split('T')[0];

    return (
        <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="bg-base-100 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`p-4 border-b border-base-200 ${getStatusColor(booking.status)}`}>
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <Scissors className="w-5 h-5" />
                            Booking Details
                        </h3>
                        <span className={`badge ${getStatusBadge(booking.status)}`}>
                            {booking.status}
                        </span>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                            <User className="w-5 h-5 text-primary" />
                            <div>
                                <div className="text-sm text-base-content/60">Customer</div>
                                <div className="font-medium">{booking.userName}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-primary" />
                            <div>
                                <div className="text-sm text-base-content/60">Email</div>
                                <div className="font-medium">{booking.userEmail}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Phone className="w-5 h-5 text-primary" />
                            <div>
                                <div className="text-sm text-base-content/60">Phone</div>
                                <div className="font-medium">{booking.userPhone || 'Not provided'}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Calendar className="w-5 h-5 text-primary" />
                            <div>
                                <div className="text-sm text-base-content/60">Date & Time</div>
                                <div className="font-medium">
                                    {new Date(booking.selectedDate).toLocaleDateString()} at {booking.selectedTime}
                                </div>
                                {booking.employeeName && (
                                    <div className="text-sm text-base-content/60">
                                        Stylist: {booking.employeeName}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="divider"></div>

                    <div>
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <Scissors className="w-4 h-4" />
                            Services
                        </h4>
                        <div className="space-y-2">
                            {booking.selectedServices?.map((service, index) => (
                                <div key={index} className="flex justify-between items-center p-3 bg-base-200 rounded-lg">
                                    <div>
                                        <div className="font-medium">{service.name}</div>
                                        <div className="text-sm text-base-content/60">{service.duration || 30} min</div>
                                    </div>
                                    <div className="font-semibold">тВм{service.price}</div>
                                </div>
                            ))}
                            <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg font-bold">
                                <span>Total</span>
                                <span>тВм{booking.totalPrice || booking.selectedServices?.reduce((sum, s) => sum + parseFloat(s.price), 0).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {booking.cancellationReason && (
                        <div className="alert alert-error">
                            <AlertTriangle className="w-5 h-5" />
                            <div>
                                <div className="font-semibold">Cancellation Reason</div>
                                <div className="text-sm">{booking.cancellationReason}</div>
                                {booking.cancelledBy && (
                                    <div className="text-xs mt-1">
                                        Cancelled by: {booking.cancelledBy}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {booking.notes && (
                        <div className="alert alert-info">
                            <MessageCircle className="w-5 h-5" />
                            <div>
                                <div className="font-semibold">Notes</div>
                                <div className="text-sm">{booking.notes}</div>
                            </div>
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {showReschedule && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-4"
                            >
                                <div className="divider">Reschedule</div>

                                <div className="card bg-base-200">
                                    <div className="card-body p-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <button
                                                className="btn btn-sm btn-circle"
                                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <h4 className="font-semibold">
                                                {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                                            </h4>
                                            <button
                                                className="btn btn-sm btn-circle"
                                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-7 gap-1 mb-2">
                                            {weekDays.map(day => (
                                                <div key={day} className="text-center text-xs font-medium text-base-content/60">
                                                    {day}
                                                </div>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-7 gap-1">
                                            {getDaysInMonth(currentMonth).map((date, index) => {
                                                const isPastDate = date && date < today;
                                                const isSelected = date && selectedDate && date.toDateString() === selectedDate.toDateString();

                                                return (
                                                    <button
                                                        key={index}
                                                        disabled={!date || isPastDate}
                                                        onClick={() => setSelectedDate(date)}
                                                        className={`
                                                            aspect-square rounded-lg text-sm
                                                            ${!date ? '' : isPastDate ? 'opacity-30 cursor-not-allowed' : 'hover:bg-primary/20 cursor-pointer'}
                                                            ${isSelected ? 'bg-primary text-primary-content' : ''}
                                                        `}
                                                    >
                                                        {date?.getDate()}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {selectedDate && (
                                    <div className="card bg-base-200">
                                        <div className="card-body p-4">
                                            <h4 className="font-semibold mb-3">Available Times</h4>
                                            <div className="grid grid-cols-4 gap-2">
                                                {availableSlots.map(time => (
                                                    <button
                                                        key={time}
                                                        onClick={() => setSelectedTime(time)}
                                                        className={`
                                                            btn btn-sm
                                                            ${selectedTime === time ? 'btn-primary' : 'btn-outline'}
                                                        `}
                                                    >
                                                        {time}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="p-4 border-t border-base-200 bg-base-100">
                    <div className="flex flex-wrap gap-2">
                        {booking.status === BOOKING_STATUS.PENDING && (
                            <>
                                <button
                                    className="btn btn-success gap-2"
                                    onClick={handleConfirm}
                                    disabled={isLoading}
                                >
                                    <CheckCircle className="w-4 h-4" />
                                    Confirm
                                </button>
                                <button
                                    className="btn btn-outline gap-2"
                                    onClick={() => setShowReschedule(!showReschedule)}
                                    disabled={isLoading}
                                >
                                    <Edit className="w-4 h-4" />
                                    Reschedule
                                </button>
                            </>
                        )}

                        {booking.status === BOOKING_STATUS.CONFIRMED && (
                            <>
                                {!isPast && (
                                    <>
                                        <button
                                            className="btn btn-info gap-2"
                                            onClick={handleComplete}
                                            disabled={isLoading}
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                            Complete
                                        </button>
                                        <button
                                            className="btn btn-warning gap-2"
                                            onClick={handleNoShow}
                                            disabled={isLoading}
                                        >
                                            <UserX className="w-4 h-4" />
                                            No-Show
                                        </button>
                                        <button
                                            className="btn btn-outline gap-2"
                                            onClick={() => setShowReschedule(!showReschedule)}
                                            disabled={isLoading}
                                        >
                                            <Edit className="w-4 h-4" />
                                            Reschedule
                                        </button>
                                    </>
                                )}
                            </>
                        )}

                        {(booking.status === BOOKING_STATUS.PENDING || booking.status === BOOKING_STATUS.CONFIRMED) && (
                            <button
                                className="btn btn-error btn-outline gap-2"
                                onClick={handleCancel}
                                disabled={isLoading}
                            >
                                <XCircle className="w-4 h-4" />
                                Cancel
                            </button>
                        )}

                        {showReschedule && selectedDate && selectedTime && (
                            <button
                                className="btn btn-primary gap-2"
                                onClick={handleReschedule}
                                disabled={isLoading}
                            >
                                Save New Time
                            </button>
                        )}

                        <div className="flex-1"></div>

                        <button className="btn btn-ghost" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default ShopOwnerBookingModal;
