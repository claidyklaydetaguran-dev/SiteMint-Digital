export interface AgentTemplate {
  id: string;
  label: string;
  emoji: string;
  greetingMessage: string;
  businessDescription: string;
  qualifyingQuestions: string[];
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "law-firm",
    label: "Law Firm",
    emoji: "⚖️",
    greetingMessage:
      "Hi! Thanks for contacting our law firm. I'm your virtual receptionist. Are you reaching out about a legal matter or would you like to schedule a consultation?",
    businessDescription:
      "We are a law firm dedicated to providing expert legal representation and counsel. Our attorneys handle a wide range of practice areas with professionalism and care, guiding clients through complex legal challenges.",
    qualifyingQuestions: [
      "What type of legal matter are you dealing with?",
      "Is this an urgent or time-sensitive situation?",
      "Have you worked with an attorney on this matter before?",
      "What outcome are you hoping to achieve?",
    ],
  },
  {
    id: "home-services",
    label: "Home Services",
    emoji: "🔧",
    greetingMessage:
      "Hi! Thanks for reaching out. I'm the virtual receptionist for our home services company. Are you looking to schedule a service call or get a quote?",
    businessDescription:
      "We provide professional home services including repairs, maintenance, and installations. Our licensed technicians deliver quality work with a satisfaction guarantee, serving homeowners in our local area.",
    qualifyingQuestions: [
      "What type of service do you need?",
      "What is the address of the property?",
      "Is this an emergency or can it be scheduled?",
      "Have you experienced this issue before?",
    ],
  },
  {
    id: "real-estate",
    label: "Real Estate",
    emoji: "🏠",
    greetingMessage:
      "Hi! Thanks for reaching out to our real estate team. I'm your virtual receptionist. Are you looking to buy, sell, or rent a property?",
    businessDescription:
      "We are a full-service real estate agency helping clients buy, sell, and rent residential and commercial properties. Our experienced agents guide you through every step of the transaction with local market expertise.",
    qualifyingQuestions: [
      "Are you looking to buy, sell, or rent?",
      "What is your target price range or budget?",
      "Which areas or neighborhoods are you interested in?",
      "What is your timeline for this transaction?",
    ],
  },
  {
    id: "medical-dental",
    label: "Medical / Dental",
    emoji: "🏥",
    greetingMessage:
      "Hi! Thanks for contacting our office. I'm the virtual receptionist. Are you an existing patient, or are you looking to schedule a new appointment?",
    businessDescription:
      "We are a healthcare practice committed to providing high-quality patient care. Our licensed professionals offer comprehensive medical and dental services in a welcoming, patient-focused environment.",
    qualifyingQuestions: [
      "Are you a new or existing patient?",
      "What is the reason for your visit?",
      "Do you have insurance, and if so, which provider?",
      "What dates and times work best for your appointment?",
    ],
  },
  {
    id: "salon-spa",
    label: "Salon & Spa",
    emoji: "💆",
    greetingMessage:
      "Hi! Thanks for reaching out to our salon. I'm your virtual receptionist. Are you looking to book an appointment or learn about our services?",
    businessDescription:
      "We are a full-service salon and spa offering a wide range of beauty and wellness treatments. Our experienced stylists and therapists are dedicated to making every client look and feel their best.",
    qualifyingQuestions: [
      "Which service are you interested in booking?",
      "Do you have a preferred stylist or therapist?",
      "When would you like to come in?",
      "Is this your first visit with us?",
    ],
  },
  {
    id: "general-business",
    label: "General Business",
    emoji: "🏢",
    greetingMessage:
      "Hi! Thanks for reaching out. I'm the virtual receptionist. How can I help you today?",
    businessDescription:
      "We are a professional business dedicated to delivering excellent service to our clients. Our team works hard to understand your needs and provide the best possible solutions.",
    qualifyingQuestions: [
      "What is the nature of your inquiry?",
      "How did you hear about us?",
      "What is your timeline for moving forward?",
      "Is there anything specific you are looking for?",
    ],
  },
];
