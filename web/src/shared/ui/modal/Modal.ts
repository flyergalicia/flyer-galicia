import { ModalRoot, ModalHeader, ModalBody, ModalFooter, ModalTitle } from "./Modal.parts.tsx";

export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Title: ModalTitle,
  Body: ModalBody,
  Footer: ModalFooter,
});
