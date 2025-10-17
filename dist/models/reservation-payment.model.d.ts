import { ReservationPayment, TeacherReservationPaymentsReportResponse } from '../types';
export declare class ReservationPaymentModel {
    static findByBookingId(bookingId: string): Promise<ReservationPayment | null>;
    static markPaid(bookingId: string): Promise<ReservationPayment | null>;
    static getTeacherReport(teacherId: string, studyYear: string): Promise<TeacherReservationPaymentsReportResponse>;
    private static mapRow;
}
//# sourceMappingURL=reservation-payment.model.d.ts.map