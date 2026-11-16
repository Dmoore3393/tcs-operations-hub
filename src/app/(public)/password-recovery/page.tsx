import type {Metadata} from 'next';
import StaffPasswordRecovery from '@/components/StaffPasswordRecovery';
export const metadata:Metadata={title:'Reset Hub password',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function Page(){return <StaffPasswordRecovery/>;}
