"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsType = exports.PaymentMethod = exports.InstallmentStatus = exports.InvoiceType = exports.InvoiceStatus = exports.EnrollmentStatus = exports.EnrollmentRequestStatus = exports.Gender = exports.BookingStatus = exports.ReservationStatus = exports.UserStatus = exports.UserType = void 0;
var UserType;
(function (UserType) {
    UserType["SUPER_ADMIN"] = "super_admin";
    UserType["TEACHER"] = "teacher";
    UserType["STUDENT"] = "student";
})(UserType || (exports.UserType = UserType = {}));
var UserStatus;
(function (UserStatus) {
    UserStatus["PENDING"] = "pending";
    UserStatus["ACTIVE"] = "active";
    UserStatus["INACTIVE"] = "inactive";
    UserStatus["SUSPENDED"] = "suspended";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
var ReservationStatus;
(function (ReservationStatus) {
    ReservationStatus["PENDING"] = "pending";
    ReservationStatus["PAID"] = "paid";
    ReservationStatus["PARTIAL"] = "partial";
    ReservationStatus["REFUNDED"] = "refunded";
})(ReservationStatus || (exports.ReservationStatus = ReservationStatus = {}));
var BookingStatus;
(function (BookingStatus) {
    BookingStatus["PENDING"] = "pending";
    BookingStatus["PRE_APPROVED"] = "pre_approved";
    BookingStatus["CONFIRMED"] = "confirmed";
    BookingStatus["APPROVED"] = "approved";
    BookingStatus["REJECTED"] = "rejected";
    BookingStatus["CANCELLED"] = "cancelled";
})(BookingStatus || (exports.BookingStatus = BookingStatus = {}));
var Gender;
(function (Gender) {
    Gender["MALE"] = "male";
    Gender["FEMALE"] = "female";
})(Gender || (exports.Gender = Gender = {}));
var EnrollmentRequestStatus;
(function (EnrollmentRequestStatus) {
    EnrollmentRequestStatus["PENDING"] = "pending";
    EnrollmentRequestStatus["APPROVED"] = "approved";
    EnrollmentRequestStatus["REJECTED"] = "rejected";
    EnrollmentRequestStatus["EXPIRED"] = "expired";
})(EnrollmentRequestStatus || (exports.EnrollmentRequestStatus = EnrollmentRequestStatus = {}));
var EnrollmentStatus;
(function (EnrollmentStatus) {
    EnrollmentStatus["ACTIVE"] = "active";
    EnrollmentStatus["COMPLETED"] = "completed";
    EnrollmentStatus["CANCELLED"] = "cancelled";
    EnrollmentStatus["EXPIRED"] = "expired";
    EnrollmentStatus["SUSPENDED"] = "suspended";
})(EnrollmentStatus || (exports.EnrollmentStatus = EnrollmentStatus = {}));
var InvoiceStatus;
(function (InvoiceStatus) {
    InvoiceStatus["PENDING"] = "pending";
    InvoiceStatus["PARTIAL"] = "partial";
    InvoiceStatus["PAID"] = "paid";
    InvoiceStatus["OVERDUE"] = "overdue";
    InvoiceStatus["CANCELLED"] = "cancelled";
})(InvoiceStatus || (exports.InvoiceStatus = InvoiceStatus = {}));
var InvoiceType;
(function (InvoiceType) {
    InvoiceType["RESERVATION"] = "reservation";
    InvoiceType["COURSE"] = "course";
    InvoiceType["INSTALLMENT"] = "installment";
    InvoiceType["PENALTY"] = "penalty";
})(InvoiceType || (exports.InvoiceType = InvoiceType = {}));
var InstallmentStatus;
(function (InstallmentStatus) {
    InstallmentStatus["PENDING"] = "pending";
    InstallmentStatus["PARTIAL"] = "partial";
    InstallmentStatus["PAID"] = "paid";
    InstallmentStatus["OVERDUE"] = "overdue";
})(InstallmentStatus || (exports.InstallmentStatus = InstallmentStatus = {}));
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["CASH"] = "cash";
    PaymentMethod["BANK_TRANSFER"] = "bank_transfer";
    PaymentMethod["CREDIT_CARD"] = "credit_card";
    PaymentMethod["MOBILE_PAYMENT"] = "mobile_payment";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
var NewsType;
(function (NewsType) {
    NewsType["WEB"] = "web";
    NewsType["MOBILE"] = "mobile";
    NewsType["WEB_AND_MOBILE"] = "web_and_mobile";
})(NewsType || (exports.NewsType = NewsType = {}));
//# sourceMappingURL=index.js.map