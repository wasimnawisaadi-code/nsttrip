-- Allow message senders and admins to delete their chat messages (unsend / delete)
CREATE POLICY "Users can delete own messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (sender_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Allow group creators and admins to delete chat groups
CREATE POLICY "Creators or admins delete groups"
ON public.chat_groups
FOR DELETE
TO authenticated
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));